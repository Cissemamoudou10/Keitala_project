"use client";

import { Plus, X } from "lucide-react";

import { CLE_ARTICLES, nomComplet, type Article } from "@/components/articles/types";
import {
  chercherArticles,
  montantLigne,
  nouvelleLigne,
  type ErreursLigne,
  type Ligne,
} from "@/components/pieces/saisie";
import { ChampMontant } from "@/components/saisie/champ-montant";
import { ChampQuantite } from "@/components/saisie/champ-quantite";
import { Button } from "@/components/ui/button";
import { Champ } from "@/components/ui/champ";
import { ChampChoix } from "@/components/ui/champ-choix";
import { multiplierDecimaux } from "@/lib/decimal";
import { formaterMontant, formaterQuantite } from "@/lib/formats";

/** Prix de vente catalogue pour l'unité choisie (le sac = prix du kg × 50), ou "". */
export function prixSuggere(article: Article, uniteId: number | null): string {
  const facteur = article.unites.find((u) => u.id === uniteId)?.facteur_vers_base ?? "1";
  const prix = multiplierDecimaux(article.prix_vente_standard, facteur, 0) ?? "0";
  return prix === "0" ? "" : prix;
}

/**
 * Lignes d'articles d'une pièce (US-ACH-01, US-VTE-01, US-VTE-04) : recherche de
 * l'article, quantité avec choix de l'unité, prix, montant en direct.
 * - `sortie` : vente ou don ; stock disponible affiché, prix catalogue proposé.
 * - `sansPrix` : don, rien à facturer.
 */
export function LignesArticles({
  titre,
  lignes,
  erreurs,
  onChange,
  sortie = false,
  sansPrix = false,
}: {
  titre: string;
  lignes: Ligne[];
  erreurs?: Record<string, ErreursLigne>;
  onChange: (lignes: Ligne[]) => void;
  sortie?: boolean;
  sansPrix?: boolean;
}) {
  const modifier = (cle: string, changement: Partial<Ligne>) =>
    onChange(lignes.map((l) => (l.cle === cle ? { ...l, ...changement } : l)));

  const choisirArticle = (ligne: Ligne, article: Article | null) => {
    // Unité de saisie courante (le sac) proposée d'emblée
    const uniteId = article?.unites[0]?.id ?? null;
    const prix = sortie && article && !sansPrix ? prixSuggere(article, uniteId) : ligne.prix;
    modifier(ligne.cle, { article, uniteId, prix });
  };

  const changerUnite = (ligne: Ligne, uniteId: number | null) => {
    const article = ligne.article;
    // Le prix catalogue suit l'unité, sauf s'il a été modifié à la main
    const suit = sortie && article && ligne.prix === prixSuggere(article, ligne.uniteId);
    modifier(ligne.cle, {
      uniteId,
      ...(suit && article ? { prix: prixSuggere(article, uniteId) } : {}),
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-label={titre}>
      <h2 className="text-titre-section font-semibold">{titre}</h2>
      {lignes.map((ligne, index) => {
        const e = erreurs?.[ligne.cle] ?? {};
        const montant = sansPrix ? null : montantLigne(ligne);
        const article = ligne.article;
        const disponible =
          sortie && article && !article.autoriser_stock_negatif ? article.stock_actuel : undefined;
        return (
          <div
            key={ligne.cle}
            className="flex flex-col gap-4 rounded-md border border-bordure p-4"
            aria-label={`Article ${index + 1}`}
            role="group"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Champ libelle="Article" erreur={e.article}>
                  {(controle) => (
                    <ChampChoix<Article>
                      {...controle}
                      valeur={ligne.article}
                      onChoix={(choix) => choisirArticle(ligne, choix)}
                      libelleDe={nomComplet}
                      cleDe={(a) => a.id}
                      rechercher={chercherArticles}
                      cleRequete={[...CLE_ARTICLES, "choix"]}
                      placeholder="Rechercher un article"
                      rendreOption={(a) => (
                        <span className="flex w-full justify-between gap-4">
                          <span>{nomComplet(a)}</span>
                          <span className="text-texte-2 tabular-nums">
                            En stock : {formaterQuantite(a.stock_actuel, a.unite_base)}
                          </span>
                        </span>
                      )}
                    />
                  )}
                </Champ>
              </div>
              {lignes.length > 1 && (
                <Button
                  variant="discret"
                  size="icone"
                  className="mt-7"
                  aria-label={`Retirer l'article ${index + 1}`}
                  title="Retirer cet article"
                  onClick={() => onChange(lignes.filter((l) => l.cle !== ligne.cle))}
                >
                  <X />
                </Button>
              )}
            </div>
            {article && (
              <div className="flex flex-wrap items-start gap-4">
                <Champ libelle="Quantité" erreur={e.quantite}>
                  {(controle) => (
                    <ChampQuantite
                      {...controle}
                      quantite={ligne.quantite}
                      onQuantiteChange={(quantite) => modifier(ligne.cle, { quantite })}
                      uniteId={ligne.uniteId}
                      onUniteChange={(uniteId) => changerUnite(ligne, uniteId)}
                      uniteBase={article.unite_base}
                      unites={article.unites}
                      disponible={disponible}
                    />
                  )}
                </Champ>
                {!sansPrix && (
                  <Champ
                    libelle={`Prix par ${
                      article.unites.find((u) => u.id === ligne.uniteId)?.libelle ??
                      article.unite_base
                    }`}
                    erreur={e.prix}
                  >
                    {(controle) => (
                      <ChampMontant
                        {...controle}
                        className="w-44"
                        value={ligne.prix}
                        onChange={(prix) => modifier(ligne.cle, { prix })}
                      />
                    )}
                  </Champ>
                )}
              </div>
            )}
            {montant && (
              <p className="text-right text-texte-2 tabular-nums">
                Montant : <span className="text-texte">{formaterMontant(montant)}</span>
              </p>
            )}
          </div>
        );
      })}
      <div>
        <Button onClick={() => onChange([...lignes, nouvelleLigne()])}>
          <Plus />
          Ajouter un article
        </Button>
      </div>
    </section>
  );
}
