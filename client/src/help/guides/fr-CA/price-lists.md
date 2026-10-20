# Listes de prix

Une liste de prix donne un prix par article, pour les ventes aux clients ou les achats auprès des fournisseurs. Une ligne de commande ajoutée sans prix en prend un dans la liste de son partenaire, et le garde : modifier une liste ne change jamais une commande déjà rédigée.

## Créer une liste de prix {#add}

1. Appuyez sur **Nouvelle liste de prix**.
2. Donnez-lui un **Nom**, tel que les gens la choisiront : Gros CAD, Cascade USD.
3. Choisissez son côté, **Ce que paient les clients** ou **Ce qu’un fournisseur facture**, et sa devise. Ni l’un ni l’autre ne pourra changer plus tard.
4. Appuyez sur **Créer**.

## Ajouter des prix {#prices}

1. Ouvrez la liste et appuyez sur **Ajouter un prix**.
2. Choisissez l’article et saisissez son prix unitaire, avant taxes.
3. Appuyez sur **Enregistrer le prix**.

Sur la ligne d’un article, **Modifier** et **Retirer** corrigent la liste. Une modification s’applique aux lignes ajoutées à partir de là; les commandes déjà tarifées gardent leur prix.

> Seule une personne qui peut créer des listes de prix voit **Nouvelle liste de prix**, et seule une personne qui peut les modifier voit **Ajouter un prix**, **Modifier** et **Retirer**.

## Donner une liste à un partenaire {#partner}

1. Ouvrez le partenaire dans [Partenaires](/partners).
2. Choisissez sa liste sous **Ventes à eux**, **Achats auprès d’eux**, ou les deux.
3. Appuyez sur **Enregistrer les listes de prix**.

> Seule une personne qui peut modifier les partenaires voit **Enregistrer les listes de prix**.

Un client sans liste à lui prend la **Liste de prix de vente par défaut**, définie dans l’onglet **Finances** de l’organisation. Un achat n’a pas de liste par défaut : les prix d’un fournisseur lui sont propres.

## Retirer une liste {#retire}

Ouvrez la liste, appuyez sur **Modifier**, décochez **En usage**, puis appuyez sur **Enregistrer**. Une liste retirée ne donne plus de prix aux nouvelles lignes et ne peut plus être donnée à un partenaire; un client qui l’avait prend la liste par défaut. Les commandes qu’elle a tarifées gardent leurs prix.

## Les mots que vous verrez {#words}

- **Vente** et **Achat** : le côté de la liste, pour les clients ou pour les fournisseurs.
- **Retirée** : conservée, mais ne donnant plus de prix aux nouvelles lignes.

## Si quelque chose est refusé {#refused}

- Une liste de prix de ce nom existe déjà. Choisissez un autre nom.
- Une liste retirée ne peut pas être donnée à un partenaire. Choisissez-en une en usage, ou remettez-la en usage.
- Sur une commande, **Prix de la liste** est refusé quand la liste n’a pas de prix pour l’article. Ajoutez-en un ici, ou saisissez le prix sur la ligne.

Voir aussi [Commandes](/orders) et [Partenaires](/partners).
