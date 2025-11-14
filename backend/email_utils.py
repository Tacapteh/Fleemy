"""Utilities to send documents by email."""

from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime
from email.message import EmailMessage
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from .pdf_utils import document_filename

logger = logging.getLogger(__name__)


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _sender_address() -> str:
    return (
        os.getenv("DOCUMENT_EMAIL_SENDER")
        or os.getenv("SMTP_SENDER")
        or os.getenv("EMAIL_SENDER")
        or os.getenv("SMTP_USERNAME")
        or "no-reply@fleemy.local"
    )


def _env_first(*names: str) -> Optional[str]:
    for name in names:
        value = os.getenv(name)
        if value:
            stripped = value.strip()
            if stripped:
                return stripped
    return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _format_date(value: Any) -> str:
    parsed = _parse_datetime(value)
    if not parsed:
        return ""
    return parsed.strftime("%d/%m/%Y")


def _format_currency(value: Any) -> str:
    try:
        amount = float(value or 0.0)
    except (TypeError, ValueError):
        return "0,00 €"
    formatted = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    return f"{formatted} €"


def _document_number(document: Dict[str, Any], document_type: str, fallback: str) -> str:
    key = "quote_number" if document_type == "quote" else "invoice_number"
    number = document.get(key) or document.get("number") or fallback
    return str(number)


def _format_total(document: Dict[str, Any]) -> str:
    return _format_currency(document.get("total"))


def _format_reference_date(document: Dict[str, Any], document_type: str) -> Optional[str]:
    label = "Valable jusqu'au" if document_type == "quote" else "Échéance"
    field = "valid_until" if document_type == "quote" else "due_date"
    formatted = _format_date(document.get(field))
    if not formatted:
        return None
    return f"{label} : {formatted}"


def build_document_email(
    document: Dict[str, Any],
    document_type: str,
    recipient: str,
    document_id: str,
    *,
    subject: Optional[str] = None,
    body: Optional[str] = None,
) -> EmailMessage:
    number = _document_number(document, document_type, document_id)
    subject_label = "devis" if document_type == "quote" else "facture"
    custom_subject = (subject or "").strip()
    subject = custom_subject or f"Votre {subject_label} {number}"

    client_name = document.get("client_name") or "client"
    total = _format_total(document)

    body_lines = [
        "Bonjour,",
        "",
        f"Veuillez trouver ci-joint {subject_label} {number} destiné à {client_name}.",
    ]

    reference = _format_reference_date(document, document_type)
    if reference:
        body_lines.append(reference)

    body_lines.extend(
        [
            f"Montant total : {total}.",
            "",
            "N'hésitez pas à nous contacter si vous avez des questions.",
            "",
            "Belle journée,",
            "L'équipe Fleemy",
        ]
    )

    normalized_body = (body or "").replace("\r\n", "\n")
    custom_body = normalized_body.strip()
    body_content = normalized_body if custom_body else "\n".join(body_lines)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_address()
    message["To"] = recipient
    message.set_content(body_content)

    return message

def _smtp_connection_from_url() -> Dict[str, Optional[Any]]:
    """Extract connection settings from standard SMTP URL env vars."""

    for name in ("SMTP_URL", "SMTP_URI", "MAIL_URL", "EMAIL_URL"):
        raw = os.getenv(name)
        if not raw:
            continue

        stripped = raw.strip()
        if not stripped:
            continue

        if "://" not in stripped:
            # Support bare host[:port] values as often configured in legacy
            # environments (e.g. Render secrets) without the scheme part.
            host_part = stripped.split("@", 1)[-1]
            host, sep, port_str = host_part.rpartition(":")
            if sep:
                candidate_host = host.strip("[] ")
                try:
                    candidate_port: Optional[int] = int(port_str)
                except ValueError:
                    logger.warning(
                        "Invalid SMTP port '%s' in %s, ignoring value", port_str, name
                    )
                    candidate_port = None
            else:
                candidate_host = host_part.strip("[] ")
                candidate_port = None

            if candidate_host:
                return {"host": candidate_host, "port": candidate_port}
            continue

        try:
            parsed = urlparse(stripped)
        except ValueError:
            logger.warning("Invalid SMTP URL in %s: %s", name, raw)
            continue

        if parsed.hostname:
            return {
                "host": parsed.hostname,
                "port": parsed.port,
            }

    return {"host": None, "port": None}


def _resolve_smtp_host() -> str:
    connection = _smtp_connection_from_url()
    if connection["host"]:
        return connection["host"]

    host = _env_first(
        "SMTP_HOST",
        "SMTP_SERVER",
        "SMTP_ADDRESS",
        "SMTP_SERVICE_HOST",
        "MAIL_HOST",
        "MAIL_SERVER",
        "MAIL_ADDRESS",
        "EMAIL_HOST",
        "EMAIL_SERVER",
        "EMAIL_ADDRESS",
        "MAILGUN_SMTP_SERVER",
        "MAILGUN_SMTP_HOST",
        "MAILGUN_SMTP_ADDRESS",
        "SENDGRID_SMTP_HOST",
        "SENDGRID_SMTP_SERVER",
        "SENDGRID_SMTP_ADDRESS",
        "SENDINBLUE_SMTP_HOST",
        "SENDINBLUE_SMTP_SERVER",
        "SENDINBLUE_SMTP_ADDRESS",
        "BREVO_SMTP_HOST",
        "BREVO_SMTP_SERVER",
        "BREVO_SMTP_ADDRESS",
    )
    if host:
        return host

    # Provide sensible defaults for well-known providers when credentials are
    # configured but the host variable is omitted. This mirrors the defaults
    # documented by the providers and avoids hard failures in deployments that
    # only set usernames/passwords.
    if _env_first("SENDGRID_USERNAME", "SENDGRID_PASSWORD", "SENDGRID_API_KEY"):
        return "smtp.sendgrid.net"

    if _env_first(
        "MAILGUN_SMTP_LOGIN",
        "MAILGUN_SMTP_PASSWORD",
        "MAILGUN_API_KEY",
        "MAILGUN_DOMAIN",
    ):
        return "smtp.mailgun.org"

    if _env_first(
        "SENDINBLUE_SMTP_LOGIN",
        "SENDINBLUE_SMTP_PASSWORD",
        "SENDINBLUE_API_KEY",
        "BREVO_SMTP_LOGIN",
        "BREVO_SMTP_PASSWORD",
        "BREVO_API_KEY",
    ):
        return "smtp-relay.sendinblue.com"

    raise RuntimeError(
        "SMTP_HOST n'est pas configuré. Définissez SMTP_HOST pour activer l'envoi d'e-mails."
    )


def _resolve_smtp_port(default_port: int) -> int:
    connection = _smtp_connection_from_url()
    if connection["port"]:
        return int(connection["port"])

    port_value = _env_first(
        "SMTP_PORT",
        "MAIL_PORT",
        "EMAIL_PORT",
        "MAIL_SERVER_PORT",
        "MAILGUN_SMTP_PORT",
        "SENDGRID_SMTP_PORT",
    )
    if not port_value:
        return default_port
    try:
        return int(port_value)
    except ValueError:
        logger.warning("Invalid SMTP port '%s', falling back to %s", port_value, default_port)
        return default_port


def _resolve_smtp_credentials() -> Dict[str, Optional[str]]:
    username = _env_first(
        "SMTP_USERNAME",
        "SMTP_USER",
        "MAIL_USERNAME",
        "MAIL_USER",
        "EMAIL_USERNAME",
        "MAILGUN_SMTP_LOGIN",
        "SENDGRID_USERNAME",
        "SENDINBLUE_SMTP_LOGIN",
        "BREVO_SMTP_LOGIN",
    )
    password = _env_first(
        "SMTP_PASSWORD",
        "SMTP_PASS",
        "MAIL_PASSWORD",
        "MAIL_PASS",
        "EMAIL_PASSWORD",
        "MAILGUN_SMTP_PASSWORD",
        "SENDGRID_PASSWORD",
        "SENDINBLUE_SMTP_PASSWORD",
        "BREVO_SMTP_PASSWORD",
    )
    return {"username": username, "password": password}


def send_document_email(
    *,
    document: Dict[str, Any],
    document_type: str,
    recipient: str,
    document_id: str,
    pdf_bytes: bytes,
    subject: Optional[str] = None,
    body: Optional[str] = None,
) -> None:
    host = _resolve_smtp_host()

    use_ssl = _bool_env("SMTP_USE_SSL", False)
    use_tls = _bool_env("SMTP_USE_TLS", not use_ssl)
    default_port = 465 if use_ssl else 587 if use_tls else 25
    port = _resolve_smtp_port(default_port)

    timeout = float(os.getenv("SMTP_TIMEOUT", "10"))
    creds = _resolve_smtp_credentials()

    message = build_document_email(
        document,
        document_type,
        recipient,
        document_id,
        subject=subject,
        body=body,
    )
    message.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=document_filename(document, document_type),
    )

    smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP

    try:
        with smtp_class(host, port, timeout=timeout) as smtp:
            smtp.ehlo()
            if use_tls and not use_ssl:
                smtp.starttls()
                smtp.ehlo()
            if creds["username"] and creds["password"]:
                smtp.login(creds["username"], creds["password"])
            smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - safety net
        logger.error("Failed to send %s %s by email: %s", document_type, document_id, exc)
        raise RuntimeError("Échec de l'envoi de l'e-mail : %s" % exc) from exc
