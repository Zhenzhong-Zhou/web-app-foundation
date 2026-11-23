# Commandes

Une commande, c’est ce que vous achetez à un fournisseur ou vendez à un client. Un achat fait entrer du stock; une vente le fait sortir.

> Une commande n’affiche ni prix, ni totaux, ni PDF à une personne dont les rôles n’incluent pas **Voir les prix des commandes** : pour les voir, demandez à quelqu’un qui peut changer les rôles.

## Créer une commande {#raise}

1. Appuyez sur **Créer une commande**.
2. Choisissez **Vente** ou **Achat**, puis le partenaire. Depuis Réapprovisionner, c’est déjà **Achat**.
3. Ajoutez chaque article et sa quantité. Le prix peut attendre : laissé vide, la liste de prix du partenaire le fournit s’il en a une.
4. Appuyez sur **Créer en brouillon**. Rien ne bouge encore, et tout reste modifiable.
5. Une fois que le partenaire est d’accord, appuyez sur **Confirmer**.

Une vente confirmée réserve le stock dont elle a besoin, pour que personne ne promette deux fois les mêmes unités.

> Seule une personne qui peut créer des commandes voit **Créer une commande**, et seule une personne qui peut les modifier voit **Confirmer**, **Clore la commande** et **Annuler la commande**.

## Recevoir un achat {#receive}

1. Ouvrez l’achat confirmé.
2. Sur la ligne de l’article, choisissez **Recevoir**.
3. Choisissez où il va et combien est arrivé. Pour un article suivi par lot, saisissez le numéro de lot tel qu’imprimé sur la boîte, ou appuyez sur **Créer un code pour nous** si elle n’en montre aucun, et pour un nouveau lot choisissez sa **Date de péremption**, comme le fait **Recevoir du stock** dans Inventaire.

Si le reste d’une ligne ne viendra jamais, choisissez **Clore incomplète** sur la ligne : l’écart reste visible.

À côté de son statut, une commande confirmée dit combien est arrivé : **Non reçue**, **Reçue en partie** ou **Entièrement reçue**, et pour une vente **Non expédiée**, **Expédiée en partie** ou **Entièrement expédiée**. Une ligne close incomplète compte comme terminée, mais une commande dont chaque ligne a été close incomplète sans rien recevoir se lit **Non reçue**, et une quantité supérieure à la commande se lit tout de même **Entièrement reçue**. L’étiquette est calculée à partir des lignes, donc personne ne la fixe, et le filtre **Réception** de la liste (**Expédition** sur une liste de ventes, **Réception ou expédition** pour les deux) la limite à l’une d’elles, conservé dans l’adresse.

Sur un achat, **Réceptions** liste chaque livraison avec son lot et la personne qui l’a reçue, et se termine par **Tous les mouvements de** et le numéro de la commande, qui ouvre [Mouvements](/movements) pour elle; les **Expéditions** d’une vente se terminent de la même façon. Quiconque peut voir la commande voit les Réceptions, l’emplacement seulement s’il peut voir les emplacements; le lien, seulement s’il peut voir le stock.

## Expédier une vente {#ship}

1. Ouvrez la vente confirmée et appuyez sur **Expédier**.
2. Choisissez d’où elle part, et combien de chaque article. Les lots sont pris par péremption la plus proche, ou **Choisir les lots** pour les choisir vous-même.
3. Ajoutez le transporteur et le numéro de suivi si vous les avez, puis appuyez sur **Expédier**.

Tout ce qui est listé part ensemble, ou rien ne part : mettez une ligne à 0 pour la laisser à plus tard. Le bordereau d’expédition et la facture partent de l’expédition, sous **Expéditions**.

> Seule une personne qui peut recevoir des marchandises voit **Recevoir**, et seule une personne qui peut expédier voit **Expédier**. Pour l’un ou l’autre, demandez à quelqu’un qui peut changer les rôles.

## Terminer une commande {#finish}

Quand plus rien n’est attendu, appuyez sur **Clore la commande**, que tout soit arrivé ou non. Une fois tout reçu, la commande demande « Tout est arrivé. Clore la commande? » (sur une vente, « Tout a été expédié. Clore la commande? »; quand une ligne a été close incomplète, « Plus rien n’est attendu. Clore la commande? »), et **Clore la commande** la ferme. **Annuler la commande** n’est offert que tant que rien n’a bougé.

## Ce qu’un lien a choisi {#chips}

Les tuiles de l’accueil et ses boutons des retards ouvrent Commandes avec la liste déjà réduite ou triée. Chaque choix s’affiche en puce au-dessus de la liste : appuyez sur son × pour le retirer, et la liste s’élargit de nouveau.

- **Ventes seulement** ou **Achats seulement** : un seul sens.
- **Brouillon** ou **Confirmée** : un seul statut.
- **Reste à expédier**, **Reste à recevoir** ou **Reste à expédier ou à recevoir** : les commandes confirmées dont il reste des articles à expédier ou à recevoir, la date prévue la plus proche d’abord, jusqu’à ce que vous triiez par une colonne.
- **En retard** : parmi celles-là, celles prévues avant aujourd’hui.
- **Les plus anciennes d’abord** : les commandes créées en premier en haut, comme **Commandes · Brouillon** les ouvre depuis l’accueil, pour que le brouillon oublié depuis le plus longtemps se voie d’abord. Retirez cette option, et les plus récentes reviennent en premier.

## Les mots que vous verrez {#words}

- **Brouillon** : rédigée, pas encore convenue.
- **Confirmée** : convenue avec le partenaire. Son étiquette dit combien est arrivé, comme plus haut.
- **Reçue** ou **Expédiée** : close. Le filtre de la liste appelle les deux **Exécutées**.
- **Annulée** : commande annulée avant tout déplacement de marchandises.
- **Close incomplète** : une ligne qui n’attend plus rien, son écart conservé.
- **En retard** : confirmée, avec encore quelque chose à expédier ou à recevoir, et prévue avant aujourd’hui.

## Si quelque chose est refusé {#refused}

- Une vente n’est confirmée qu’une fois que chaque article a un prix. Zéro est un prix.
- Une commande pour laquelle des marchandises ont déjà été déplacées ne peut pas être annulée. Choisissez plutôt **Clore la commande**.
- Aucun article ne peut être ajouté à une commande confirmée. Créez une nouvelle commande pour cet article.
- Une ligne ne peut plus changer une fois des marchandises reçues dessus. Choisissez **Clore incomplète** sur la ligne, et créez une nouvelle commande pour le reste.

Voir aussi [Factures](/invoices) et [Partenaires](/partners).
