from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.db import Base
from app.ingest import guest_profiles as g, wikipedia
from app.ingest.snapshot import source_snapshot

NOW = datetime(2026, 11, 6, 6)
ARTICLE = '<h1>2026 24 Hours of Le Mans</h1><table><a href="/wiki/Jordan_Taylor">Jordan Taylor</a></table>'
BIO = '<h1>Jordan Taylor</h1><table class="infobox"><tr><td><span class="bday">1991-05-10</span></td></tr></table>'


@pytest.fixture
def db():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        season = models.Season(year=2026, championship_name='WEC')
        cls = models.RaceClass(name='HYPERCAR')
        team = models.Team(name='WTR')
        driver = models.Driver(name='Jordan Taylor', nationality='USA', photo_url='existing')
        db.add_all([season, cls, team, driver]); db.flush()
        car = models.Car(season_id=season.id, race_class_id=cls.id, team_id=team.id, number='101', is_guest=True)
        db.add(car); db.flush()
        db.add(models.CarDriver(car_id=car.id, driver_id=driver.id, season_id=season.id, rounds='3'))
        db.commit()
        yield db
    engine.dispose()


def error(status, headers=None):
    response = httpx.Response(status, headers=headers, request=httpx.Request('GET','https://en.wikipedia.org/wiki/test'))
    return httpx.HTTPStatusError('upstream blocked', request=response.request, response=response)


def test_article_reused_without_duplicate_request(monkeypatch):
    monkeypatch.setattr(wikipedia, 'fetch_text', lambda *args, **kwargs: ARTICLE)
    monkeypatch.setattr(g.httpx, 'get', lambda *args, **kwargs: pytest.fail('duplicate HTTP request'))
    @source_snapshot
    def refresh():
        url = 'https://en.wikipedia.org/wiki/2026_24_Hours_of_Le_Mans'
        assert wikipedia.fetch_html(url) == ARTICLE
        assert g._fetch(url) == ARTICLE
    refresh()


def test_wikipedia_request_identifies_project_and_deduplicates_only_within_refresh(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append(kwargs)
        return httpx.Response(200, text=BIO, request=httpx.Request('GET',url))
    monkeypatch.setattr(g.httpx, 'get', get)
    @source_snapshot
    def refresh():
        g._fetch('https://en.wikipedia.org/wiki/Jordan_Taylor')
        g._fetch('https://en.wikipedia.org/wiki/Jordan_Taylor')
    refresh(); refresh()
    assert len(calls) == 2
    assert 'github.com/maysun0907/wec-dashboard' in calls[0]['headers']['User-Agent']
    assert calls[0]['follow_redirects'] is True


def test_block_preserves_success_timestamp_and_data_then_retries_after_cooldown(db, monkeypatch):
    previous = NOW - timedelta(days=8)
    db.add(models.IngestCheckpoint(scope='guest-profiles:2026', completed_at=previous,
                                   manifest={'succeeded_at':previous.isoformat()})); db.commit()
    monkeypatch.setattr(g, '_fetch', lambda _: (_ for _ in ()).throw(error(403)))
    assert g.enrich_guest_profiles(db, 2026, now=NOW) == 0
    db.commit()
    checkpoint = db.get(models.IngestCheckpoint,'guest-profiles:2026')
    assert checkpoint.manifest['outcome'] == 'failed'
    assert checkpoint.manifest['http_status'] == 403
    assert checkpoint.completed_at == previous
    assert checkpoint.manifest['succeeded_at'] == previous.isoformat()
    monkeypatch.setattr(g, '_fetch', lambda _: pytest.fail('cooldown must defer HTTP'))
    g.enrich_guest_profiles(db,2026,now=NOW+timedelta(hours=1))
    monkeypatch.setattr(g, '_fetch', lambda url: BIO if url.endswith('Jordan_Taylor') else ARTICLE)
    assert g.enrich_guest_profiles(db,2026,now=NOW+timedelta(hours=6)) == 1
    db.commit()
    assert db.query(models.Driver).one().photo_url == 'existing'
    assert checkpoint.manifest['outcome'] == 'ok'
    assert 'retry_at' not in checkpoint.manifest
    monkeypatch.setattr(g, '_fetch', lambda _: pytest.fail('weekly checkpoint must defer HTTP'))
    g.enrich_guest_profiles(db,2026,now=NOW+timedelta(days=1))


def test_individual_biography_block_is_not_marked_success(db,monkeypatch):
    calls=[]
    def fetch(url):
        calls.append(url)
        if url.endswith('Jordan_Taylor'): raise error(429,{'Retry-After':'86400'})
        return ARTICLE
    monkeypatch.setattr(g,'_fetch',fetch)
    g.enrich_guest_profiles(db,2026,now=NOW); db.commit()
    checkpoint=db.get(models.IngestCheckpoint,'guest-profiles:2026')
    assert len(calls)==2
    assert checkpoint.manifest['outcome']=='failed'
    assert datetime.fromisoformat(checkpoint.manifest['retry_at']) == NOW+timedelta(days=1)
    assert db.query(models.Driver).one().dob is None


@pytest.mark.parametrize('value', ['invalid','Fri, 06 Nov 2026 18:00:00 GMT'])
def test_retry_after_date_or_malformed_header(value):
    delay=g._retry_at(error(429,{'Retry-After':value}), NOW)
    assert delay == NOW+timedelta(hours=6 if value=='invalid' else 12)


def test_challenge_html_not_accepted_as_success(db,monkeypatch):
    monkeypatch.setattr(g,'_fetch',lambda _: '<h1>Access denied</h1>')
    g.enrich_guest_profiles(db,2026,now=NOW)
    assert db.get(models.IngestCheckpoint,'guest-profiles:2026').manifest['outcome']=='failed'
