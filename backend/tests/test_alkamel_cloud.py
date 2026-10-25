import json

import pytest

from app.ingest import alkamel as a
from app.ingest.snapshot import source_snapshot

PREFIX = '15_2026/07_BARCELONA-CATALUNYA/688_FIA WEC/202610181200_Race/06_Hour 6/'
FINAL = PREFIX + '03_Classification_Race_Hour 6_Final.CSV'
ANALYSIS = PREFIX + '23_Analysis_Race_Hour 6.CSV'


def cloud_fixture(monkeypatch):
    docs = {
        a.BASE + '/': '<html data-beasties-container><app-root></app-root></html>',
        a.CLOUD_INDEX: json.dumps({'type': 'seasons_index', 'seasons': [
            {'id': '15_2026', 'name': '2026', 'manifestUrl': 'wec/manifests/results_15_2026.json'}]}),
        a.CLOUD + '/wec/manifests/results_15_2026.json': json.dumps({'folders': [{'children': [
            {'url': 'wec/results/' + FINAL}, {'url': 'wec/results/' + ANALYSIS},
            {'url': 'wec/results/15_2026/06_FUJI SPEEDWAY/679_FIA WEC/file.CSV'}]}]}),
    }
    def fetch(url):
        return docs[a.BASE + '/'] if url.startswith(a.BASE) else docs[url]
    monkeypatch.setattr(a, '_fetch', fetch)
    return docs


def test_cloud_discovery_filters_event_and_uses_real_document_urls(monkeypatch):
    cloud_fixture(monkeypatch)
    assert a.resolve_event_params(2026, 7) == ('15_2026', '07_BARCELONA-CATALUNYA')
    selected = a._list_race_csvs('15_2026', '07_BARCELONA-CATALUNYA')
    assert selected == ('202610181200', a._cloud_url('wec/results/' + FINAL), a._cloud_url('wec/results/' + ANALYSIS))
    assert '06_FUJI' not in a._event_html('15_2026', '07_BARCELONA-CATALUNYA')
    assert a.race_result_status(selected[1], '6 Hours of Barcelona') == 'final'
    assert a.race_result_status(selected[1].replace('_Final', ''), '6 Hours of Barcelona') == 'completed'


def test_cloud_known_final_remains_available_when_listing_omits_it(monkeypatch):
    docs = cloud_fixture(monkeypatch)
    key = a.CLOUD + '/wec/manifests/results_15_2026.json'
    docs[key] = json.dumps({'folders': [{'children': [{'url': 'wec/results/' + ANALYSIS}]}]})
    for known in (a.BASE + '/Results/' + a.quote(FINAL, safe='/'), a._cloud_url('wec/results/' + FINAL)):
        selected = a._list_race_csvs('15_2026', '07_BARCELONA-CATALUNYA', known)
        assert selected[1] == a._cloud_url('wec/results/' + FINAL)


def test_cloud_session_analysis_weather_and_amended_priority(monkeypatch):
    docs = cloud_fixture(monkeypatch)
    session = '15_2026/07_BARCELONA-CATALUNYA/688_FIA WEC/202610161200_Free Practice 1/'
    classification = session + '03_Classification_Free Practice 1.CSV'
    analysis = session + '23_Analysis_Free Practice 1.CSV'
    weather = session + '26_Weather_Free Practice 1.CSV'
    race_weather = PREFIX + '26_Weather_Race_Hour 6.CSV'
    amended = FINAL.replace('_Final', '_Amended')
    paths = [FINAL, amended, ANALYSIS, classification, analysis, weather, race_weather]
    docs[a.CLOUD + '/wec/manifests/results_15_2026.json'] = json.dumps({
        'folders': [{'children': [{'children': [{'url': 'wec/results/' + p} for p in paths]}]}]})
    assert a._list_session_csvs('15_2026', '07_BARCELONA-CATALUNYA') == [
        ('FP1', '', a._cloud_url('wec/results/' + classification),
         a._cloud_url('wec/results/' + analysis), '202610161200')]
    assert a.find_weather_url('15_2026', '07_BARCELONA-CATALUNYA', 'FP1') == a._cloud_url('wec/results/' + weather)
    assert a.find_weather_url('15_2026', '07_BARCELONA-CATALUNYA', 'RACE') == a._cloud_url('wec/results/' + race_weather)
    assert a._list_race_csvs('15_2026', '07_BARCELONA-CATALUNYA')[1] == a._cloud_url('wec/results/' + amended)


@pytest.mark.parametrize('url', ['https://evil.test/wec/results/file.CSV', '//evil.test/wec/results/file.CSV',
                                'wec/results/../secret', 'wec/results/%2e%2e/secret',
                                'wec/results/file.CSV?token=bad', 'http://files.alkamelcloud.com/wec/results/file.CSV'])
def test_cloud_rejects_untrusted_document_urls(url):
    with pytest.raises(ValueError):
        a._cloud_url(url)


def test_legacy_csv_fetch_is_migrated_and_deduplicated(monkeypatch):
    calls = []
    monkeypatch.setattr(a, 'fetch_text', lambda url, **kwargs: calls.append(url) or 'NUMBER;TIME\n8;1:30.000')
    @source_snapshot
    def refresh():
        a._fetch(a.BASE + '/Results/' + a.quote(FINAL, safe='/'))
        a._fetch(a._cloud_url('wec/results/' + FINAL))
    refresh()
    assert calls == [a._cloud_url('wec/results/' + FINAL)]


def test_html_csv_response_and_unknown_portal_are_not_silent_empty_data(monkeypatch):
    with pytest.raises(ValueError, match='HTML'):
        a._parse_race_classification('<!doctype html><title>Loading...</title>')
    monkeypatch.setattr(a, '_fetch', lambda _: '<html>unexpected layout</html>')
    with pytest.raises(ValueError, match='selector missing'):
        a._season_param_for_year(2026)


def test_malformed_cloud_manifest_cannot_pass_as_unpublished_results(monkeypatch):
    docs = cloud_fixture(monkeypatch)
    docs[a.CLOUD + '/wec/manifests/results_15_2026.json'] = '{"folders":[]}'
    with pytest.raises(ValueError, match='Empty'):
        a._event_html('15_2026', '07_BARCELONA-CATALUNYA')
