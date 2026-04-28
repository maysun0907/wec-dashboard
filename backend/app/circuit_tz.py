"""IANA timezone per circuit name. Mirrors frontend/src/lib/circuit-tz.ts.
Used by the ingester to convert session-schedule local times into UTC."""


CIRCUIT_TIMEZONE: dict[str, str] = {
    "Imola Circuit": "Europe/Rome",
    "Autodromo Nazionale di Monza": "Europe/Rome",
    "Circuit de Spa-Francorchamps": "Europe/Brussels",
    "Circuit de la Sarthe": "Europe/Paris",
    "Circuit Paul Ricard": "Europe/Paris",
    "Silverstone Circuit": "Europe/London",
    "Algarve International Circuit": "Europe/Lisbon",
    "Nürburgring": "Europe/Berlin",
    "Interlagos Circuit": "America/Sao_Paulo",
    "Autódromo José Carlos Pace": "America/Sao_Paulo",
    "Circuit of the Americas": "America/Chicago",
    "Sebring International Raceway": "America/New_York",
    "Fuji Speedway": "Asia/Tokyo",
    "Shanghai International Circuit": "Asia/Shanghai",
    "Losail International Circuit": "Asia/Qatar",
    "Bahrain International Circuit": "Asia/Bahrain",
}


def tz_for_circuit(name: str | None) -> str:
    return CIRCUIT_TIMEZONE.get(name or "", "UTC")
