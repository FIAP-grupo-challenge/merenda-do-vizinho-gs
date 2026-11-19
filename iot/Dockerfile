# Imagem do simulador da câmara fria (Python 3.12, só biblioteca padrão). Contexto de build: a raiz do
# repositório; a pasta fica em /srv/iot, como no repositório.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
RUN useradd --uid 1000 --create-home merenda
COPY iot iot
USER merenda
CMD ["python", "iot/simulador.py"]
