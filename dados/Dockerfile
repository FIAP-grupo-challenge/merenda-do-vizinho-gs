# Imagem do pipeline do data lake (Python 3.12). Contexto de build: a raiz do repositório, porque o pipeline lê
# compartilhado/ por caminho relativo; cada pasta fica em /srv/<pasta>, como no repositório.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY dados/requirements.txt dados/
RUN pip install --no-cache-dir --root-user-action=ignore -r dados/requirements.txt
# uid 1000, o do usuário comum no Linux: o Compose monta ./dados/datalake do host, e o pipeline grava nela
RUN useradd --uid 1000 --create-home merenda
COPY compartilhado compartilhado
COPY dados dados
USER merenda
CMD ["python", "-m", "dados.pipeline", "tudo"]
