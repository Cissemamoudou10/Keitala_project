from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.erreurs import enregistrer_gestionnaires_erreurs
from app.routers import (
    achats,
    articles,
    auth,
    controles,
    entreprise,
    sante,
    stocks,
    tiers,
    tresorerie,
    utilisateurs,
    ventes,
)

VERSION = "0.1.0"


def create_app() -> FastAPI:
    app = FastAPI(
        title="ERP Keitala API",
        description="API de l'ERP Keitala : stocks, achats, production, ventes, trésorerie.",
        version=VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        openapi_url="/openapi.json" if settings.DEBUG else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    enregistrer_gestionnaires_erreurs(app)
    for routeur in (
        sante.router,
        auth.router,
        utilisateurs.router,
        tresorerie.router,
        articles.router,
        tiers.router,
        stocks.router,
        achats.router,
        ventes.router,
        entreprise.router,
        controles.router,
    ):
        app.include_router(routeur, prefix="/api/v1")
    return app


app = create_app()
