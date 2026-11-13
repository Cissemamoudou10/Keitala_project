FROM python:3.12-slim

WORKDIR /app

# L'environnement virtuel vit hors de /app : en développement, /app est monté depuis
# le poste (Windows) et ne doit pas recevoir un environnement Linux.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /bin/uv

# Dépendances d'abord (couche mise en cache), versions figées par uv.lock
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache

COPY . .

EXPOSE 8000

CMD ["uv", "run", "--frozen", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
