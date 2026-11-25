# Valeur du stock

Ce que vaut ce qui est en stock, dans la devise de base. Chaque lot porte ce qu’il a coûté; le stock sans lot porte un coût moyen courant. Les valeurs sont le coût des matières seulement : ce qui a été acheté, et ce qui est entré dans un lot.

L’équipement n’est compté ni ici ni sous **En attente d’un coût** : les machines et les outils sont conservés, mais ne sont ni vendus ni consommés. [Inventaire](/inventory) montre toujours où chacun se trouve.

## Donner un coût au stock {#costs}

Le stock reçu sans information suffisante pour calculer sa valeur figure sous **En attente d’un coût**, et **Motif** indique pourquoi : reçu sans prix, prix dans une devise sans taux en dossier, ajouté à l’inventaire, ou en stock au début de l’évaluation. Tant qu’il n’a pas de coût, la valeur en stock est **Provisoire**.

1. Sur sa ligne, appuyez sur **Fixer le coût**.
2. Saisissez le **Prix unitaire**, par unité tel que le fournisseur l’a facturé, et sa **Devise**.
3. Pour une autre devise que celle de base, saisissez le **Taux de change**, ou laissez-le vide pour utiliser le taux en dossier pour le jour de l’arrivée.
4. Appuyez sur **Fixer le coût**.

Un coût donné à une livraison suit la partie de celle-ci qui est passée à un autre lot, de sorte que les deux lots sont évalués, et **Fixer le coût** dit à quels lots une partie a suivi. Du stock venu d’un lot qui attend encore indique « Venu du lot », son coût suivant celui de ce lot, et n’offre pas de **Fixer le coût** à lui.

Si une partie de cette livraison est déjà sortie, expédiée ou utilisée, le coût se partage entre ses unités en proportion : ce qui est parti en prend sa part, que la page du lot liste sous **Comment sa valeur a évolué** comme **Coût du stock déjà sorti**, et ce qui est encore en stock ne garde que la sienne. Un retour, ou une expédition annulée, ramène sa partie de cette part.

Un retour sans coût d’expédition, d’une expédition d’avant que les coûts soient tenus, ou du stock reçu dans l’inventaire comme « Retourné » sans commande, arrive au coût moyen de son lot quand ce lot a du stock et que rien n’attend un coût : sa ligne sous **Comment sa valeur a évolué** se termine par « , au coût moyen du lot », et **Fixer le coût** peut la corriger. Sinon il attend, et prend un coût sur sa propre ligne, comme du stock reçu sans prix.

Un lot fabriqué par un ordre encore ouvert attend plutôt son ordre : **Voir l’ordre de fabrication** y mène, et le lot prend son coût à la clôture de l’ordre.

> Seule une personne qui peut modifier les coûts voit **Fixer le coût**.

## Lire la valeur {#read}

Le total est **En stock**, celui de tous les articles et lots, quoi que montre la liste. **Par article et par lot** liste chaque article et chaque lot avec sa quantité, son **Coût unitaire** et sa **Valeur**, cinquante à la fois, par article; le code d’un lot ouvre sa traçabilité, et « anciennement ASH-06O1 » dessous dit un code qu’il a eu avant. Sous la liste, « 50 sur 14 512 articles et lots affichés » et **Afficher 50 de plus**, qui ajoute les cinquante suivants et met le focus sur la première nouvelle ligne; s’ils ne peuvent pas être chargés, les lignes restent, avec **Réessayer**. Le retour depuis un lot ramène à la ligne que vous avez quittée. **Exporter** télécharge tous les articles et lots dans un fichier de feuille de calcul.

Tapez dans **Trouver un article ou un lot** n’importe quelle partie du nom ou du code d’un article, ou du code d’un lot, de son lot du fournisseur ou d’un code qu’il a eu avant. La liste montre ce qui correspond, avec « 12 sur 14 512 correspondent » à côté de la zone, le total inchangé et la recherche dans l’adresse; un texte qui ne correspond à rien le dit, avec **Effacer la recherche**.

Appuyez sur **Valeur**, en tête de sa colonne, pour mettre la plus grande valeur d’abord, et encore pour la plus petite. **Article** remet l’ordre des articles.

## Les mots que vous verrez {#words}

- **Devise de base** : la devise dans laquelle le stock est évalué, définie dans l’onglet **Finances** de l’organisation.
- **Provisoire** : une valeur qui compte encore quelque chose en attente d’un coût.
- **Coût unitaire** : la valeur d’une unité, soit la valeur divisée par la quantité.

## Si quelque chose est refusé {#refused}

- Aucune devise de base n’est définie, donc rien ne peut être évalué. Définissez-en une dans [Organisation](/settings/organization).
- Aucun taux n’est en dossier en date du jour de l’arrivée ou avant. Saisissez-en un dans [Taux de change](/settings/exchange-rates#add), ou donnez le taux avec le coût.

Voir aussi [Taux de change](/settings/exchange-rates).
