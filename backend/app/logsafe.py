"""Log redaction: a logging.Filter that scrubs bearer/JWT tokens, signed-link signatures, OTP codes, secrets and full email
addresses from every record before it is written. Installed on the root, uvicorn and vibeloop handlers at startup.
Code should still never log these in the first place — this is the safety net."""
import logging, re

_RULES = [
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"), r"\1[REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+"), "[JWT]"),
    (re.compile(r"(?i)\b(sig|token|code|otp|secret|password|key|authkey|approvalToken)=([^&\s\"']+)"), r"\1=[REDACTED]"),
    (re.compile(r"(?i)(\"(?:sig|token|code|otp|demoCode|secret|password|keySecret|secretKey|webhookSecret|authKey|approvalToken)\"\s*:\s*)\"[^\"]*\""), r'\1"[REDACTED]"'),
    (re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b"), r"\1***@\2"),
]

def redact(text: str) -> str:
    for rx, rep in _RULES: text = rx.sub(rep, text)
    return text

class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            clean = redact(msg)
            if clean != msg: record.msg, record.args = clean, None
        except Exception: pass
        return True

_F = RedactFilter()

def install(*logger_names: str):
    names = logger_names or ("", "uvicorn", "uvicorn.access", "uvicorn.error", "vibeloop", "vibeloop.request", "sqlalchemy.engine")
    for n in names:
        lg = logging.getLogger(n)
        if _F not in lg.filters: lg.addFilter(_F)
        for h in lg.handlers:
            if _F not in h.filters: h.addFilter(_F)
