# Imagem da IA (Python 3.12). Contexto de build: a raiz do repositório, porque a IA lê compartilhado/ por
# caminho relativo; cada pasta fica em /srv/<pasta>, como no repositório.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY ia/requirements.txt ia/
RUN pip install --no-cache-dir --root-user-action=ignore -r ia/requirements.txt
RUN useradd --uid 1000 --create-home merenda
COPY compartilhado compartilhado
COPY ia ia
USER merenda
EXPOSE 3001
CMD ["python", "-m", "ia.servidor"]
