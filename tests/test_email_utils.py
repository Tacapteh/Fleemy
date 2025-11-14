import importlib
import sys
import types

import pytest


_RELEVANT_ENV_VARS = [
    "SMTP_HOST",
    "SMTP_SERVER",
    "MAIL_HOST",
    "MAIL_SERVER",
    "EMAIL_HOST",
    "MAILGUN_SMTP_SERVER",
    "SENDGRID_SMTP_HOST",
    "SENDINBLUE_SMTP_HOST",
    "SENDINBLUE_SMTP_SERVER",
    "BREVO_SMTP_HOST",
    "BREVO_SMTP_SERVER",
    "SMTP_URL",
    "SMTP_URI",
    "MAIL_URL",
    "EMAIL_URL",
    "SENDGRID_USERNAME",
    "SENDGRID_PASSWORD",
    "SENDGRID_API_KEY",
    "MAILGUN_SMTP_LOGIN",
    "MAILGUN_SMTP_PASSWORD",
    "MAILGUN_API_KEY",
    "MAILGUN_DOMAIN",
    "SENDINBLUE_SMTP_LOGIN",
    "SENDINBLUE_SMTP_PASSWORD",
    "SENDINBLUE_API_KEY",
    "BREVO_SMTP_LOGIN",
    "BREVO_SMTP_PASSWORD",
    "BREVO_API_KEY",
]


def _clear_env(monkeypatch):
    for name in _RELEVANT_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def _reload_email_utils(monkeypatch):
    module_name = "backend.email_utils"
    if module_name in sys.modules:
        del sys.modules[module_name]
    dummy_pdf_utils = types.ModuleType("backend.pdf_utils")
    dummy_pdf_utils.document_filename = lambda *args, **kwargs: "document.pdf"
    monkeypatch.setitem(sys.modules, "backend.pdf_utils", dummy_pdf_utils)
    return importlib.import_module(module_name)


@pytest.mark.parametrize(
    "env, expected",
    [
        ({"SENDGRID_USERNAME": "apikey"}, "smtp.sendgrid.net"),
        ({"SENDGRID_PASSWORD": "secret"}, "smtp.sendgrid.net"),
        ({"MAILGUN_SMTP_LOGIN": "user"}, "smtp.mailgun.org"),
        ({"MAILGUN_DOMAIN": "mg.example.com"}, "smtp.mailgun.org"),
        ({"SENDINBLUE_SMTP_LOGIN": "user"}, "smtp-relay.sendinblue.com"),
        ({"BREVO_API_KEY": "secret"}, "smtp-relay.sendinblue.com"),
    ],
)
def test_resolve_smtp_host_with_provider_defaults(monkeypatch, env, expected):
    _clear_env(monkeypatch)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    email_utils = _reload_email_utils(monkeypatch)
    assert email_utils._resolve_smtp_host() == expected


def test_resolve_smtp_host_without_configuration(monkeypatch):
    _clear_env(monkeypatch)
    email_utils = _reload_email_utils(monkeypatch)
    with pytest.raises(RuntimeError) as exc:
        email_utils._resolve_smtp_host()
    assert "SMTP_HOST n'est pas configuré" in str(exc.value)


@pytest.mark.parametrize(
    "env_name",
    ["SMTP_URL", "SMTP_URI", "MAIL_URL", "EMAIL_URL"],
)
def test_resolve_smtp_host_from_url(monkeypatch, env_name):
    _clear_env(monkeypatch)
    monkeypatch.setenv(env_name, "smtp://user:secret@smtp.example.net:2525")
    email_utils = _reload_email_utils(monkeypatch)
    assert email_utils._resolve_smtp_host() == "smtp.example.net"
    assert email_utils._resolve_smtp_port(587) == 2525


@pytest.mark.parametrize(
    "value, expected_host, expected_port",
    [
        ("smtp.example.org", "smtp.example.org", None),
        ("smtp.example.org:2025", "smtp.example.org", 2025),
        ("user@smtp.example.org:465", "smtp.example.org", 465),
    ],
)
def test_resolve_smtp_host_from_url_without_scheme(
    monkeypatch, value, expected_host, expected_port
):
    _clear_env(monkeypatch)
    monkeypatch.setenv("SMTP_URL", value)
    email_utils = _reload_email_utils(monkeypatch)
    assert email_utils._resolve_smtp_host() == expected_host
    assert email_utils._resolve_smtp_port(25) == (expected_port or 25)
