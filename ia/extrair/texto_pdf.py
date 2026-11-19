import io

import pypdf


def texto_do_pdf(dados: bytes) -> str:
    """Texto de todas as páginas; vem vazio num PDF escaneado. PDF corrompido levanta pypdf.errors.PyPdfError."""
    leitor = pypdf.PdfReader(io.BytesIO(dados))
    return '\n'.join(pagina.extract_text() for pagina in leitor.pages)
