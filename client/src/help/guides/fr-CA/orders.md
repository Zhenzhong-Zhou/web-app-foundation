# Commandes

Une commande, c’est ce que vous achetez à un fournisseur ou vendez à un client. Un achat fait entrer du stock; une vente le fait sortir.

> Une commande n’affiche ni prix, ni totaux, ni PDF à une personne dont les rôles n’incluent pas **Voir les prix des commandes** : pour les voir, demandez à quelqu’un qui peut changer les rôles.

## Créer une commande {#raise}

1. Appuyez sur **Créer une commande**.
2. Choisissez le partenaire, et si **Nous leur achetons** ou **Nous leur vendons**.
3. Ajoutez chaque article et sa quantité. Le prix peut attendre : laissé vide, la liste de prix du partenaire le fournit s’il en a une.
4. Appuyez sur **Créer en brouillon**. Rien ne bouge encore, et tout reste modifiable.
5. Une fois que le partenaire est d’accord, appuyez sur **Confirmer**.

Une vente confirmée réserve le stock dont elle a besoin, pour que personne ne promette deux fois les mêmes unités.

> Seule une personne qui peut créer des commandes voit **Créer une commande**, et seule une personne qui peut les modifier voit **Confirmer**, **Clore la commande** et **Annuler la commande**.

## Recevoir un achat {#receive}

1. Ouvrez l’achat confirmé.
2. Sur la ligne de l’article, choisissez **Recevoir**.
3. Choisissez où il va et combien est arrivé. Pour un produit suivi par lot, saisissez le numéro de lot et la date de péremption tels qu’imprimés sur la boîte.

Si le reste d’une ligne ne viendra jamais, choisissez **Clore incomplète** sur la ligne : l’écart reste visible.

## Expédier une vente {#ship}

1. Ouvrez la vente confirmée et appuyez sur **Expédier**.
2. Choisissez d’où elle part, et combien de chaque article. Les lots sont pris par péremption la plus proche, ou **Choisir les lots** pour les choisir vous-même.
3. Ajoutez le transporteur et le numéro de suivi si vous les avez, puis appuyez sur **Expédier**.

Tout ce qui est listé part ensemble, ou rien ne part : mettez une ligne à 0 pour la laisser à plus tard. Le bordereau d’expédition et la facture partent de l’expédition, sous **Expéditions**.

> Seule une personne qui peut recevoir des marchandises voit **Recevoir**, et seule une personne qui peut expédier voit **Expédier**. Pour l’un ou l’autre, demandez à quelqu’un qui peut changer les rôles.

## Terminer une commande {#finish}

Quand plus rien n’est attendu, appuyez sur **Clore la commande**, que tout soit arrivé ou non. **Annuler la commande** n’est offert que tant que rien n’a bougé.

## Les mots que vous verrez {#words}

- **Brouillon** : rédigée, pas encore convenue.
- **Confirmée** : convenue avec le partenaire.
- **Reçue** ou **Expédiée** : close. Le filtre de la liste appelle les deux **Exécutées**.
- **Annulée** : abandonnée avant que rien ne bouge.
- **Close incomplète** : une ligne qui n’attend plus rien, son écart conservé.

## Si quelque chose est refusé {#refused}

- Une vente n’est confirmée qu’une fois que chaque article a un prix. Zéro est un prix.
- Une commande pour laquelle des marchandises ont bougé ne peut pas être annulée. Clôturez-la plutôt.
- Aucun article ne peut être ajouté à une commande confirmée. Créez une nouvelle commande pour cet article.
- Une ligne ne peut plus changer une fois des marchandises reçues dessus. Choisissez **Clore incomplète** sur la ligne, et créez une nouvelle commande pour le reste.

Voir aussi [Factures](/invoices) et [Partenaires](/partners).
