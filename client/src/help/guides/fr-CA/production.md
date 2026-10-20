# Production

Un ordre de fabrication consomme des composants et produit un article fini, fabriqué par vous ou par un fabricant à façon. Il lui faut une recette, qui se trouve sur la page du produit.

## Planifier un ordre {#plan}

1. Appuyez sur **Planifier un ordre**.
2. Choisissez ce que vous fabriquez sous **Fabrication de**, et sa **Recette**.
3. Saisissez la **Quantité à fabriquer**. Les composants s’ajustent, à partir de la recette, à la quantité saisie.
4. Choisissez où il est **Fabriqué à** : les composants y sont sortis, et la production y est reçue.
5. Choisissez le **Fabricant à façon**, ou **Nous le fabriquons nous-mêmes**, et appuyez sur **Planifier l’ordre**. Rien ne bouge encore.

> Seule une personne qui peut planifier des ordres voit **Planifier un ordre**.

## Lancer un ordre {#release}

1. Ouvrez l’ordre planifié et appuyez sur **Lancer**.
2. Choisissez où **Prendre les composants à**. Les lots sont pris par péremption la plus proche, ou **Choisir les lots** pour les choisir vous-même.
3. Appuyez sur **Lancer**. La recette est copiée sur l’ordre et les composants vont là où il est fabriqué; modifier la recette ensuite ne peut donc pas changer cet ordre.

> Seule une personne qui peut lancer des ordres voit **Lancer** et **Annuler l’ordre**.

## Enregistrer la production et clore {#close}

1. À mesure que des unités sont terminées, appuyez sur **Enregistrer la production** et saisissez ce qui est **Terminé cette fois-ci**, dans le même lot ou un nouveau. Un lot fabriqué sur plusieurs jours s’enregistre petit à petit.
2. Quand l’ordre est terminé, appuyez sur **Clore l’ordre** et saisissez ce qui a été **Réellement utilisé**. Plus que prévu ne pose pas de problème; ce qui reste demeure là où se trouve l’ordre, à ranger à la main.

> Seule une personne qui peut terminer des ordres voit **Enregistrer la production** et **Clore l’ordre**.

## Les mots que vous verrez {#words}

- **Recette** : ce dont un produit est fait. La version qu’utilisent les ordres est celle mise en vigueur sur la page du produit.
- **Composant** : ce qu’une recette consomme.
- **Lot** : ce qu’un ordre fabrique, tracé comme un lot reçu.
- **Planifié**, **En cours**, **Terminé** : un ordre avant son lancement, après, et une fois clos.

## Si quelque chose est refusé {#refused}

- Un ordre sans recette peut être planifié mais pas lancé. Créez une recette sur la page du produit et mettez-la en vigueur, puis lancez.
- Un emplacement à court d’un composant ne peut pas lancer l’ordre. Déplacez-y d’abord le stock, ou prenez-le à un autre emplacement. Le stock réservé pour des ventes confirmées n’est pas pris.
- Une licence expirée, pas encore en vigueur ou retirée peut empêcher un lancement, selon la [politique de licences](/settings/organization#licences). Une personne qui peut passer outre peut lancer avec un motif, conservé sur l’ordre.
- L’annulation ne remet pas les composants sortis en place : quelqu’un doit les déplacer.

Voir aussi [Produits](/products) et [Lots](/lots).
