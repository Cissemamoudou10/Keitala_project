"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChampMontant } from "@/components/saisie/champ-montant";
import { Champ } from "@/components/ui/champ";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formaterMontant, formaterQuantite } from "@/lib/formats";
import { notifier } from "@/lib/notifications";

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-titre-section font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

export function Catalogue() {
  const [montant, setMontant] = React.useState("2030000");

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-12 px-4 py-8 md:px-8 lg:px-12">
      <h1 className="text-titre-page font-semibold">Composants de base</h1>

      <Section titre="Boutons">
        <div className="flex flex-wrap gap-2">
          <Button variant="principal">Enregistrer la vente</Button>
          <Button>Exporter</Button>
          <Button variant="discret">Filtrer</Button>
          <Button variant="principal" enCours>
            Enregistrer la vente
          </Button>
        </div>
      </Section>

      <Section titre="Champs">
        <div className="flex max-w-[720px] flex-col gap-6">
          <Champ libelle="Client" facultatif aide="Laisser vide pour un client de passage.">
            {(controle) => <Input placeholder="Nom du client" {...controle} />}
          </Champ>
          <Champ libelle="Quantité" erreur="Stock insuffisant : il reste 150 kg. Réduisez la quantité.">
            {(controle) => <Input inputMode="decimal" defaultValue="200" {...controle} />}
          </Champ>
          <Champ libelle="Compte">
            {(controle) => (
              <Select defaultValue="CAISSE">
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAISSE">Caisse</SelectItem>
                  <SelectItem value="BANQUE">Banque</SelectItem>
                  <SelectItem value="ORANGE_MONEY">Orange Money</SelectItem>
                  <SelectItem value="MOBICASH">Mobicash</SelectItem>
                  <SelectItem value="WAVE">Wave</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Champ>
        </div>
      </Section>

      <Section titre="Saisie d'un montant">
        <div className="flex max-w-[720px] flex-col gap-2">
          <Champ libelle="Montant reçu" aide={`Valeur envoyée à l'API : "${montant}"`}>
            {(controle) => <ChampMontant value={montant} onChange={setMontant} {...controle} />}
          </Champ>
        </div>
      </Section>

      <Section titre="Étiquettes">
        <div className="flex flex-wrap gap-2">
          <Badge variant="succes">Payé</Badge>
          <Badge variant="attention">Partiel</Badge>
          <Badge variant="danger">À crédit</Badge>
          <Badge variant="info">En cours</Badge>
          <Badge variant="neutre">Annulé</Badge>
        </div>
      </Section>

      <Section titre="Tableau">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead numerique>Stock</TableHead>
              <TableHead>Unité</TableHead>
              <TableHead numerique>Valeur</TableHead>
              <TableHead>État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Soja Consommation</TableCell>
              <TableCell numerique>{formaterQuantite("1250.000")}</TableCell>
              <TableCell>kg</TableCell>
              <TableCell numerique>{formaterMontant("312500.00")}</TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell>Gari 200 g</TableCell>
              <TableCell numerique>{formaterQuantite("12.000")}</TableCell>
              <TableCell>sachets</TableCell>
              <TableCell numerique>{formaterMontant("3600.00")}</TableCell>
              <TableCell>
                <Badge variant="danger">Stock bas</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section titre="Fenêtre et notifications">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Annuler la vente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Annuler la vente FAC-2026-0042</DialogTitle>
                <DialogDescription>
                  Le stock sera remis et le règlement de 45 000 FCFA sera retiré de la Caisse.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Garder la vente</Button>
                </DialogClose>
                <Button variant="danger">Annuler la vente</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            onClick={() =>
              notifier.succes("Vente FAC-2026-0042 enregistrée", {
                libelle: "Voir",
                href: "/composants",
              })
            }
          >
            Notification
          </Button>
          <Button onClick={() => notifier.erreur("Le serveur ne répond pas. Réessayez.")}>
            Notification d&apos;erreur
          </Button>
        </div>
      </Section>

      <Toaster />
    </main>
  );
}
