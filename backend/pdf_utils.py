import asyncio
from weasyprint import HTML


def _quote_html(quote: dict) -> str:
    items = "".join(
        f"<tr><td>{item.get('description', '')}</td><td>{item.get('quantity', '')}</td><td>{item.get('unit_price', '')}</td><td>{item.get('total', '')}</td></tr>"
        for item in quote.get('items', [])
        if any(str(item.get(k, "")).strip() for k in ("description", "quantity", "unit_price", "total"))
    )
    return f"""
    <html>
    <head><meta charset='utf-8'><title>Quote {quote.get('quote_number')}</title></head>
    <body>
    <h1>Quote {quote.get('quote_number')}</h1>
    <p>Client: {quote.get('client_name')}</p>
    <table border='1' cellspacing='0' cellpadding='4'>
    <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
    {items}
    </table>
    <p>Subtotal: {quote.get('subtotal')}</p>
    <p>Tax ({quote.get('tax_rate')}%): {quote.get('tax_amount')}</p>
    <p>Total: {quote.get('total')}</p>
    </body></html>
    """


def _invoice_html(invoice: dict) -> str:
    items = "".join(
        f"<tr><td>{item.get('description', '')}</td><td>{item.get('quantity', '')}</td><td>{item.get('unit_price', '')}</td><td>{item.get('total', '')}</td></tr>"
        for item in invoice.get('items', [])
        if any(str(item.get(k, "")).strip() for k in ("description", "quantity", "unit_price", "total"))
    )
    return f"""
    <html>
    <head><meta charset='utf-8'><title>Invoice {invoice.get('invoice_number')}</title></head>
    <body>
    <h1>Invoice {invoice.get('invoice_number')}</h1>
    <p>Client: {invoice.get('client_name')}</p>
    <table border='1' cellspacing='0' cellpadding='4'>
    <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
    {items}
    </table>
    <p>Subtotal: {invoice.get('subtotal')}</p>
    <p>Tax ({invoice.get('tax_rate')}%): {invoice.get('tax_amount')}</p>
    <p>Total: {invoice.get('total')}</p>
    </body></html>
    """


async def quote_pdf_bytes(quote: dict) -> bytes:
    html = _quote_html(quote)
    return await asyncio.to_thread(lambda: HTML(string=html).write_pdf())


async def invoice_pdf_bytes(invoice: dict) -> bytes:
    html = _invoice_html(invoice)
    return await asyncio.to_thread(lambda: HTML(string=html).write_pdf())
