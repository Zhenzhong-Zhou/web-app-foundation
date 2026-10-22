# Glossary

The words the app uses for its domain, fixed per language before anything
is translated (ADR-054), so one concept is one word everywhere. A
translation that disagrees with this file is wrong, even if it reads well;
change the file first, then every catalogue that uses the word.

Drafted with the French and Chinese catalogues. **Not yet reviewed by
someone fluent:** that review is a manual check before the release that
offers either language (MC-1405).

## Terms

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Product | Produit | 产品 | |
| Variant | Variante | 规格 | The thing counted: "60ct". |
| SKU | UGS | SKU | French: unité de gestion des stocks. Chinese keeps the Latin abbreviation, as labels do. |
| Lot | Lot | 批次 | A traced quantity with a code and an expiry. |
| Location | Emplacement | 库位 | A shelf, bin or site stock sits in. |
| Site / Zone / Aisle / Shelf / Bin | Site / Zone / Allée / Tablette / Casier | 站点 / 区域 / 通道 / 货架 / 货位 | A location's type by depth, outermost first. |
| Stock | Stock | 库存 | |
| Movement | Mouvement | 库存变动 | |
| Partner | Partenaire | 合作伙伴 | A customer, a supplier, or both. |
| Customer | Client | 客户 | |
| Supplier | Fournisseur | 供应商 | |
| Sales order | Commande client | 销售订单 | |
| Purchase order | Bon de commande | 采购订单 | |
| Shipment | Expédition | 发货 | |
| Packing slip | Bordereau d’expédition | 装箱单 | |
| Receipt (receiving) | Réception | 收货 | Goods arriving, not a sales receipt. |
| Invoice | Facture | 发票 | |
| Credit note | Note de crédit | 贷项通知单 | |
| Return authorization (RMA) | Autorisation de retour | 退货授权 | |
| Recipe | Recette | 配方 | A product's bill of materials. |
| Production run | Ordre de fabrication | 生产订单 | |
| Batch | Lot | 批次 | What a run makes; the same word as a received lot. |
| Component | Composant | 物料 | What a recipe consumes. |
| Release (a run) | Lancer | 下达 | Copies the recipe and issues the components. |
| Promote (a recipe) | Mettre en vigueur | 启用 | Makes a draft the recipe new runs use. |
| Contract manufacturer | Fabricant à façon | 代工厂 | |
| Licence | Licence | 许可证 | NPN and similar product licences. |
| Price list | Liste de prix | 价目表 | |
| Tax code | Code de taxe | 税码 | |
| Organization | Organisation | 组织 | The tenant: a company using the app. |
| Invitation | Invitation | 邀请 | To join an organization that exists (ADR-077). The page calls an organization invitation one too. |
| Organization invitation | Invitation à créer une organisation | 创建组织的邀请 | The operator's link to set up a new organization, as its Owner (ADR-078). The page says Set up / Créer / 创建. |
| Start an organization | Créer une organisation | 创建组织 | An account with no organization making one, where registration is open (ADR-078). |
| Sign in / Sign out | Se connecter / Se déconnecter | 登录 / 退出登录 | |
| Email (address) | Courriel | 电子邮箱 | Quebec usage. |

The words on the screens that the guides (ADR-079) lean on, by area, each
as the catalogues word it.

### Roles and people

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Owner | Propriétaire | 所有者 | A role: everything, including settings and closing the organization. |
| Admin | Administrateur | 管理员 | A role: the day-to-day work, and inviting members. |
| Viewer | Lecteur | 查看者 | A role: reads, and changes nothing. |
| Member | Membre | 成员 | Someone who belongs to an organization. The page is Members / Membres / 成员. |
| Role | Rôle | 角色 | What a member may do there. |
| Permission | Permission | 权限 | One thing a role allows, such as See prices on orders: a checkbox in the role editor (ADR-080). Not *autorisation* in French, which is a return authorization. |
| Made role | Rôle créé ici | 本组织创建的角色 | A role the organization made, from a template (modèle, 模板) or a copy, shown as named in every language (ADR-080). Roles marks it Made here / Créé ici / 本组织创建, beside Built in / Intégré / 内置. |
| Move everyone to… | Déplacer tout le monde vers… | 全部移至… | On a role's page: everyone holding it moves to another role (ADR-080). |
| Remove from the organization | Retirer de l’organisation | 从组织中移除 | Ends a member's access; their account and their work's name stay (ADR-080). Leave / Quitter / 离开 is the member's own. |
| Invitation link | Lien d’invitation | 邀请链接 | |
| Revoke (an invitation) | Révoquer | 收回 | |

### Pages

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Home | Accueil | 首页 | |
| Getting started | Premiers pas | 入门指引 | A new organization's first steps, on Home (ADR-058). |
| People | Personnes | 同事 | Everyone in the organization, and how to reach them (ADR-063). |
| Audit log | Journal d’audit | 审计日志 | |

### Order statuses

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Draft | Brouillon | 草稿 | Written, not yet agreed. |
| Confirmed | Confirmée | 已确认 | Agreed with the partner. |
| Received / Shipped | Reçue / Expédiée | 已收货 / 已发货 | Closed: the one status, in its direction's word (ADR-041). |
| Cancelled | Annulée | 已取消 | |
| Open / Fulfilled | Ouvertes / Exécutées | 未完成 / 已完成 | The list's filters. |

### Shipping

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Close short / Closed short | Clore incomplète / Close incomplète | 短缺关闭 / 已短缺关闭 | A line that expects no more, its shortfall kept (ADR-034). |
| Carrier | Transporteur | 承运商 | |
| Tracking number | Numéro de suivi | 运单号 | |

### Stock

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Held | Réservé | 已预留 | Kept for a confirmed sale (ADR-045). |
| Free | Libre | 可用 | What can still be promised. |
| Backordered | En rupture | 缺货待发 | |
| Not available | Non disponible | 不可用 | A location whose stock is not for sending (ADR-042). |
| Correct the count | Corriger le compte | 更正库存数量 | Records an adjustment. |
| Adjustment | Ajustement | 调整 | A movement's reason, as are the four below. |
| Transfer | Transfert | 移库 | |
| Consumption | Consommation | 消耗 | What a run used. |
| Sample | Échantillon | 样品 | |
| Unit of measure | Unité de mesure | 计量单位 | |
| Discontinue / Discontinued | Abandonner / Abandonné | 停用 / 已停用 | A product no longer offered. |
| Retire / Retired | Retirer / Retiré | 停用 / 已停用 | A partner, location or list kept for the records that name it. |
| In use | En usage | 使用中 | The opposite of retired. |

### Lots

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Lot number | Numéro de lot | 批号 | As printed on the box, typed when receiving. |
| Lot code | Code de lot | 批次编码 | What a trace searches by. |
| Expires | Date de péremption | 有效期至 | Blank for a lot that does not expire. |
| Expiring soon | Expire bientôt | 即将过期 | Within the days the organization sets (ADR-060). |
| Recall | Rappel | 召回 | |

### Licences

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Current | En vigueur | 有效 | |
| Not yet in force | Pas encore en vigueur | 尚未生效 | |
| Expired | Expirée | 已过期 | |
| Withdrawn | Retirée | 已撤销 | |
| Override | Dérogation | 例外批准 | Releasing a run despite the licence policy, with a reason (ADR-050). |

### Recipes and runs

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Active / Archived | Active / Archivée | 已启用 / 已归档 | A recipe in use, and one it replaced. |
| Planned | Planifié | 已计划 | A run before it is released. |
| In progress | En cours | 进行中 | A released run. |
| Finished | Terminé | 已完成 | A closed run. |

### Invoices and returns

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Issue / Issued | Émettre / Émise | 开具 / 已开具 | An invoice numbered and sent; it never changes. |
| Void / Voided | Annuler / Annulée | 作废 / 已作废 | An invoice reversed in full by a credit note, or a shipment that never left. |
| Credit | Créditer | 开具贷项 | Give back part of an invoice, by a credit note. |
| Uncollectable | Irrécouvrable | 无法收回 | |
| Replace | Remplacement | 换货 | An RMA's resolution: a new sale at zero. |
| Close RMA / Closed | Clore l’autorisation / Close | 关闭退货授权 / 已关闭 | |

### Money and settings

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Base currency | Devise de base | 本位币 | What stock is valued in. |
| Exchange rate | Taux de change | 汇率 | |
| Unit cost | Coût unitaire | 单位成本 | |
| Provisional | Provisoire | 暂估 | A value that still counts stock waiting for a cost. |
| Waiting for a cost | En attente d’un coût | 等待成本 | |
| Registered address | Adresse du siège | 注册地址 | The seller's address on every invoice. |
| Billing address | Adresse de facturation | 账单地址 | A partner's address marked Invoices go here / Les factures sont envoyées ici / 发票寄往此处. |
| Time zone | Fuseau horaire | 时区 | |
| Prefix | Préfixe | 前缀 | A document number's start (ADR-073). |
| Exempt | Exonéré | 免税 | A tax code that charges nothing. |
| Default sale price list | Liste de prix de vente par défaut | 默认销售价目表 | |

### Help and the welcome

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Help | Aide | 帮助 | The button in the top bar, and the panel it opens (ADR-079). |
| Guide | Guide | 指南 | A page's help: what it is for, how to work in it, what may be refused. |
| All guides | Tous les guides | 所有指南 | The list at Help's foot. |
| Learn more | En savoir plus | 了解更多 | Opens Help at the section a page points to. |
| Welcome card | Carte de bienvenue | 欢迎卡片 | A newcomer's own card on Home, for their first two weeks. |
| Your first week | Votre première semaine | 您的第一周 | The welcome's list, ticked by what the person does. |
| What you can do here | Ce que vous pouvez faire ici | 您在这里可以做什么 | One sentence per area, from the person's permissions. |
| Your access | Votre accès | 权限 | On Account: Your access at {organization} / Votre accès chez {organization} / 我在 {organization} 的权限. |
| Dismiss | Masquer | 隐藏 | Takes a card off Home: the welcome, Getting started. |
| Undo | Annuler | 撤销 | |
| New (on People) | Nouveau | 新加入 | Someone who joined in the last two weeks. |

## Writing conventions

- **Apostrophes:** use ’ (U+2019) in translations, never '. An ASCII
  apostrophe is ICU's escape character and can swallow a placeholder.
- **French (Canada):** Quebec typography, as the Office québécois de la
  langue française recommends: no space before ?, ! or ;, a non-breaking
  space before : and inside « ». Vouvoiement throughout. This holds in the
  client's and the server's catalogues alike.
- **Simplified Chinese:** full-width punctuation (，。？：), a space between
  Chinese and a Latin word or a number only where it reads better, none
  around full-width punctuation.
- **Ellipsis:** the single character … in every language, as the English
  uses for "Saving…".
- **Placeholders:** `{name}` and tags like `<link>` are kept exactly, in
  whatever position the sentence needs; `npm run i18n:check` fails
  otherwise.
