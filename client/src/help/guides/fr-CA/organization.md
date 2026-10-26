# Organisation

La façon dont l’organisation fonctionne ici : son profil, ses finances, ses documents, son stock, son image de marque et sa sécurité, chacun dans un onglet. Tout le monde peut les consulter.

> Seule une personne qui peut modifier les paramètres de l’organisation voit les boutons d’enregistrement, et les onglets **Image de marque** et **Sécurité**.

## Profil {#profile}

Sous **Profil**, chaque facture imprime le nom, le numéro de taxes et l’adresse comme vendeur, tels qu’ils étaient le jour de son émission.

1. Remplissez le **Nom de l’organisation**, le **Numéro d’inscription aux taxes** et l’**Adresse du siège**, en enregistrant chacun.
2. Choisissez le **Fuseau horaire** de l’entreprise, puis appuyez sur **Enregistrer le fuseau horaire**. Il fixe le jour de l’organisation, par exemple quand une licence expire.

Tout télécharger et fermer l’organisation se trouvent à la fin de l’onglet.

## Finances {#money}

Sous **Finances**, définissez la **Devise de base**, celle dans laquelle le stock est évalué, avant l’arrivée du stock : ce qui est reçu avant attend un coût. La **Liste de prix de vente par défaut** sert aux clients qui n’ont pas de liste à eux.

## Numérotation {#numbering}

Sous **Documents**, chaque type de document a sa propre série. Une modification s’applique à partir du prochain document; un numéro déjà attribué ne change jamais.

1. Saisissez le **Préfixe**, ou partez d’un format courant. Ajoutez la date avec ses boutons, en **{YYYY}**, **{YY}**, **{MM}** ou **{DD}** : avec l’année, les factures s’impriment sous la forme INV-2026-0455.
2. Choisissez les **Chiffres**, et quand la série **Recommence** : jamais, chaque année, chaque mois ou chaque jour.
3. Fixez le **Prochain numéro**, appuyez sur **Enregistrer la numérotation**, puis sur **Modifier la numérotation**.

## Licences au lancement {#licences}

Sous **Stock**, choisissez ce que fait le lancement d’un ordre quand la licence de sa recette n’est pas encore en vigueur, ou a expiré. Une licence retirée est toujours refusée.

1. Pour **Pas encore en vigueur** et pour **Expirée**, choisissez **Refuser**, **Refuser sauf dérogation, avec un motif**, ou **Permettre, et l’enregistrer**.
2. Cochez **Une recette doit porter une licence pour être lancée** si chaque ordre en a besoin, puis appuyez sur **Enregistrer la politique de licences**.

## Image de marque {#branding}

Sous **Image de marque**, choisissez l’apparence de l’application pour tout le monde ici.

1. Sous **Logo**, appuyez sur **Téléverser un logo**. Large ou carré, il s’affiche en haut de la barre latérale, et s’imprime sur les factures, les notes de crédit et les bordereaux d’expédition, sauf si **Documents** en décide autrement.
2. Sous **Logo carré**, appuyez sur **Téléverser un logo carré** pour les petits espaces, comme la barre latérale repliée. La ligne en dessous indique ce qui s’y affiche sans lui.
3. Choisissez une **Couleur** et la teinte de la **Barre latérale**, puis appuyez sur **Enregistrer l’image de marque**.

## Déconnexion après inactivité {#idle-sign-out}

Sous **Sécurité**, pour les ordinateurs que plusieurs personnes partagent.

1. Sous **Après**, choisissez la durée sans utilisation, de 15 minutes à 4 heures, ou **Désactivé**.
2. Sous **S’applique à**, choisissez seulement les connexions sans **Rester connecté**, ou tout le monde, puis appuyez sur **Enregistrer**.

Une minute avant, un avertissement propose **Rester connecté**. Le réglage ne peut que raccourcir une session, jamais l’allonger.

## Les mots que vous verrez {#words}

- **Adresse du siège** : l’adresse du vendeur que chaque facture imprime.
- **Dérogation** : un ordre lancé malgré sa licence, son motif conservé.

## Si quelque chose est refusé {#refused}

- Aucune facture n’est émise tant que l’adresse du siège n’est pas définie.
- La devise de base ne peut plus changer une fois que du stock porte une valeur dans cette devise.
- Un prochain numéro inférieur à un numéro déjà attribué est refusé; le plus bas permis est proposé.
- Deux types de documents avec le même préfixe imprimeraient les mêmes numéros : donnez à chacun le sien.
- Un logo carré doit être presque carré, au plus 5 : 4 dans un sens comme dans l’autre, et faire au moins 128 pixels de côté. Utilisez une image large comme logo principal.

Voir aussi [Taux de change](/settings/exchange-rates) et [Listes de prix](/settings/price-lists).
