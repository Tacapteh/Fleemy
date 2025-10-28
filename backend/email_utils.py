"""Utilities to send documents by email."""

from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime
from email.message import EmailMessage
from typing import Any, Dict, Optional

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
) -> EmailMessage:
    number = _document_number(document, document_type, document_id)
    subject_label = "devis" if document_type == "quote" else "facture"
    subject = f"Votre {subject_label} {number}"

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

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_address()
    message["To"] = recipient
    message.set_content("\n".join(body_lines))

    return message


def _resolve_smtp_host() -> str:
    host = _env_first(
        "SMTP_HOST",
        "SMTP_SERVER",
        "MAIL_HOST",
        "MAIL_SERVER",
        "EMAIL_HOST",
        "MAILGUN_SMTP_SERVER",
        "SENDGRID_SMTP_HOST",
    )
    if host:
        return host
    raise RuntimeError(
        "SMTP_HOST n'est pas configuré. Définissez SMTP_HOST pour activer l'envoi d'e-mails."
    )


def _resolve_smtp_port(default_port: int) -> int:
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
    )
    password = _env_first(
        "SMTP_PASSWORD",
        "SMTP_PASS",
        "MAIL_PASSWORD",
        "MAIL_PASS",
        "EMAIL_PASSWORD",
        "MAILGUN_SMTP_PASSWORD",
        "SENDGRID_PASSWORD",
    )
    return {"username": username, "password": password}


def send_document_email(
    *,
    document: Dict[str, Any],
    document_type: str,
    recipient: str,
    document_id: str,
    pdf_bytes: bytes,
) -> None:
    host = _resolve_smtp_host()

    use_ssl = _bool_env("SMTP_USE_SSL", False)
    use_tls = _bool_env("SMTP_USE_TLS", not use_ssl)
    default_port = 465 if use_ssl else 587 if use_tls else 25
    port = _resolve_smtp_port(default_port)

    timeout = float(os.getenv("SMTP_TIMEOUT", "10"))
    creds = _resolve_smtp_credentials()

    message = build_document_email(document, document_type, recipient, document_id)
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
