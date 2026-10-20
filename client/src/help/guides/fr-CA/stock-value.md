# Valeur du stock

Ce que vaut le stock en main, dans la devise de base. Chaque lot porte ce qu’il a coûté; le stock sans lot porte un coût moyen courant. Les valeurs sont le coût des matières seulement : ce qui a été acheté, et ce qui est entré dans un lot.

## Donner un coût au stock {#costs}

Le stock arrivé sans rien pour l’évaluer est listé sous **En attente d’un coût**, et **Motif** dit ce qui manque : reçu sans prix, prix dans une devise sans taux en dossier, ajouté à l’inventaire, ou en stock au début de l’évaluation. Tant qu’il n’a pas de coût, la valeur en stock est **Provisoire**.

1. Sur sa ligne, appuyez sur **Fixer le coût**.
2. Saisissez le **Prix unitaire**, par unité tel que le fournisseur l’a facturé, et sa **Devise**.
3. Pour une autre devise que celle de base, saisissez le **Taux de change**, ou laissez-le vide pour utiliser le taux en dossier pour le jour de l’arrivée.
4. Appuyez sur **Fixer le coût**.

Un lot fabriqué par un ordre encore ouvert attend plutôt son ordre : **Ouvrir l’ordre** y mène, et le lot prend son coût à la clôture de l’ordre.

> Seule une personne qui peut modifier les coûts voit **Fixer le coût**.

## Lire la valeur {#read}

Le total est **En stock**. **Par article et par lot** liste chaque article et chaque lot avec sa quantité, son **Coût unitaire** et sa **Valeur**; le code d’un lot ouvre sa traçabilité. **Exporter** télécharge la liste dans un fichier de tableur.

## Les mots que vous verrez {#words}

- **Devise de base** : la devise dans laquelle le stock est évalué, définie dans l’onglet **Finances** de l’organisation.
- **Provisoire** : une valeur qui compte encore quelque chose en attente d’un coût.
- **Coût unitaire** : la valeur d’une unité, soit la valeur divisée par la quantité.

## Si quelque chose est refusé {#refused}

- Aucune devise de base n’est définie, donc rien ne peut être évalué. Définissez-en une dans [Organisation](/settings/organization).
- Aucun taux n’est en dossier en date du jour de l’arrivée ou avant. Saisissez-en un dans [Taux de change](/settings/exchange-rates#add), ou donnez le taux avec le coût.

Voir aussi [Taux de change](/settings/exchange-rates).
