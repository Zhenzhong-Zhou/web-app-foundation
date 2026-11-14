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
| Item | Article | 物品 | Anything the company keeps, of any type: the page, the menu, the top bar's group (ADR-092). In the code, API and database it is `product`, a row of `products`; new names use `product`, and no file is renamed (#553). |
| Product | Produit | 商品 | The goods it sells, and only those: the type, and its tab (ADR-092). Not 产品, which Chinese keeps only in the licences' regulatory terms. In the code that type is `good`; `product` there means any item (#553). |
| Products / Raw materials / Packaging / Supplies / Samples / Equipment | Produits / Matières premières / Emballages / Fournitures / Échantillons / Équipement | 商品 / 原材料 / 包装材料 / 耗材 / 样品 / 设备 | An item's type, each its tab's name (ADR-092). 耗材 is what the accounts call 低值易耗品. |
| Product / Raw material / Packaging / Supply / Sample / Equipment | Produit / Matière première / Emballage / Fourniture / Échantillon / Équipement | 商品 / 原材料 / 包装材料 / 耗材 / 样品 / 设备 | One item's type, in the singular: under the item's name on its page, Edit's Type and Add's choice (#548). The tabs and the pickers' groups keep the plural; Chinese has one word for both. |
| Variant | Variante | 规格 | The thing counted: "60ct". |
| Category / Uncategorised | Catégorie / Sans catégorie | 分类 / 未分类 | Items' grouping, one tree per organization; an item is in one or none (ADR-092). |
| Code | Code | 编码 | A variant's own code, on its label, documents and every CSV; once SKU · UGS · SKU (ADR-092). The organization's export keeps its column's name, `sku`. |
| English / French / Chinese (a name's language) | anglais / français / chinois | 英文 / 法文 / 中文 | The language a name or a text is written in, inside a sentence: has no English name, n’a pas de nom en anglais, 没有英文名称, and Edit names' 名称（英文）. Chinese says 英文 and 法文, as the exports' columns do (英文名称), never 英语 and 法语, which name the language as spoken or learned; a table beside `languageWord` holds the three, in the server's `translate.ts` and the client's `locales.ts`. Every other reader keeps Intl's names (ADR-054's November 2026 amendment). |
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
| Recipe | Recette | 配方 | An item's bill of materials. |
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
| Tile | Tuile | 磁贴 | One kind of work on Home, under What needs you today: its count, opening its list (ADR-091). Home's guide names it; the screen does not. Chinese says 磁贴, not 卡片, which the welcome card (欢迎卡片) is (ADR-091's review). A tile and the filter it opens share one name, the plainer of the two, each held in its row below: Low stock, Expiring soon, Waiting for a cost, To issue, Open returns, In progress, Licences expiring. Where that word alone does not say what it is about, the page's name goes first, the word after it still the filter's: Stock value · Waiting for a cost, Invoices · To issue, Production · In progress, Orders · Draft (发票 · 待开具, Factures · À émettre; decision 47a). |
| More | Plus | 更多 | Beside Home's main action, a menu of the other actions the member may take (ADR-091). |
| Customise Home | Personnaliser l’accueil | 调整首页 | The button at the right of What needs you today, and what it opens: each person's own order of Home's tiles, which are hidden, and whether Recently opened shows, on every device they use (ADR-091, amended November 2026). Up and Down (Monter, Descendre; 上移、下移) move a tile, as its handle (poignée, 手柄) drags it (Faire glisser, 拖动); Hide and Show (Masquer, Afficher; 隐藏、显示) take it off and back; Done (Terminé, 完成) saves. |
| Hidden tiles | Tuiles masquées | 已隐藏的磁贴 | Customise Home's list below the tiles, each with Show; a hidden tile's late items still show in the panel of what is late. |
| Reset to default | Rétablir l’ordre par défaut | 恢复默认 | In Customise Home: the order the person's role gives, the drafts hidden and Recently opened on, saved by Done. |
| People | Personnes | 同事 | Everyone in the organization, and how to reach them (ADR-063). |
| Audit log | Journal d’audit | 审计日志 | |

### Order statuses

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Draft | Brouillon | 草稿 | Written, not yet agreed. |
| Orders · Draft | Commandes · Brouillon | 订单 · 草稿 | Home's drafts tile, its page's name first and Orders' Draft filter after it; hidden until a person shows it in Customise Home, never late (ADR-091, amended November 2026). |
| Confirmed | Confirmée | 已确认 | Agreed with the partner. |
| Received / Shipped | Reçue / Expédiée | 已收货 / 已发货 | Closed: the one status, in its direction's word (ADR-041). |
| Cancelled | Annulée | 已取消 | |
| Open / Fulfilled | Ouvertes / Exécutées | 未完成 / 已完成 | The list's filters. |
| Late | En retard | 逾期 | An outstanding order past its expected day, in the organization's day: Orders' filter, and its chip "2 days late" / « 2 jours de retard » / 逾期 2 天. Home's panel of what is late counts these with the items out and the lots and licences expired (ADR-091). Never "overdue". |
| Oldest first | Les plus anciennes d’abord | 最早的在前 | Orders' chip for the list by when each order was made, the oldest at the top, where no column is sorted: Home's drafts tile opens it so (ADR-057's amendment; ADR-091, amended November 2026). Removing it lists newest first again. |

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
| Not available | Non disponible | 不可发货 | A location whose stock is not for sending (ADR-042). Not 不可用, which reads as the opposite of Free's 可用. |
| Correct the count | Corriger le compte | 更正库存数量 | Records an adjustment. |
| Ship out | Sortie de stock | 出库 | Inventory's action that sends stock out with no order; an order's Ship stays Expédier / 发货. |
| Adjustment | Ajustement | 调整 | A movement's reason, as are the four below. |
| Transfer | Transfert | 移库 | |
| Consumption | Consommation | 消耗 | What a run used. |
| Sample | Échantillon | 样品 | |
| Unit of measure | Unité de mesure | 计量单位 | |
| Discontinue / Discontinued | Abandonner / Abandonné | 停用 / 已停用 | An item no longer offered or used. |
| Retire / Retired | Retirer / Retiré | 归档 / 已归档 | A partner, location, list or tax code kept for the records that name it. Not 停用, which is Discontinue's. |
| In use | En usage | 使用中 | The opposite of retired. |

### Reorder points

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Reorder point | Point de commande | 库存下限 | An item's level below which it is low (ADR-085). Inventory's tab of the same name lists them. Chinese says the word inventory software uses, a pair with 最高库存, not 再订货点, the English word for word (ADR-091). |
| Low stock | Stock bas | 库存不足 | Home's tile, Reorder points' filter it opens, which holds the out too, and the bell's notice (ADR-091). |
| Low / Out / Enough | Bas / Épuisé / Suffisant | 不足 / 缺货 / 充足 | Where an item stands: below its point, at zero or less, or at or above it. The filter for the low is Low stock. |
| Position | Position | 预计可用 | Usable + coming − still needed: what the point is compared with. |
| Usable | Utilisable | 现有可用 | Stock at locations marked available, less expired lots and what runs were issued. |
| Coming | À venir | 在途 | Confirmed purchases still to receive, and released runs' output still to come. |
| Still needed | Encore requis | 待发 | Confirmed sales still to ship. |
| In draft / Drafted | En brouillon / Brouillon fait | 草稿中 / 已下草稿 | Draft purchases and runs: shown, never counted as coming. Drafted: what is in draft leaves nothing to suggest. |
| Suggested order | Commande suggérée | 建议订货 | For a made item, 建议生产. |
| Bought / Made | Acheté / Fabriqué | 采购 / 自制 | How an item with a point is replenished. |
| Just enough / A fixed quantity / Up to a maximum | Juste assez / Quantité fixe / Jusqu’à un maximum | 补足到库存下限 / 固定订货量 / 补到最高库存 | The three rules for how much to order. |

### Lots

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Lot number | Numéro de lot | 批号 | As printed on the box, typed when receiving. |
| Lot code | Code de lot | 批次编码 | What a trace searches by. |
| Expires | Date de péremption | 有效期至 | Blank for a lot that does not expire. |
| Expiring soon | Expire bientôt | 即将过期 | Within the days the organization sets (ADR-060): Inventory's filter and Home's tile. |
| Expired | Périmé | 已过期 | A lot past its expiry: Inventory's filter, Périmés, and Home's « 1 lot périmé ». A licence is *expirée*. |
| Recall | Rappel | 召回 | |

### Licences

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Current | En vigueur | 有效 | |
| Not yet in force | Pas encore en vigueur | 尚未生效 | |
| Expired | Expirée | 已过期 | |
| Licences expiring | Licences qui expirent | 即将到期的许可证 | Within 60 days of its Valid until day, or past it: Licences' filter and Home's tile, which keeps the kind's name, since the lots' tile is Expiring soon (ADR-091). |
| Withdrawn | Retirée | 已撤销 | |
| Override | Dérogation | 例外批准 | Releasing a run despite the licence policy, with a reason (ADR-050). |

### Recipes and runs

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Active / Archived | Active / Archivée | 已启用 / 已归档 | A recipe in use, and one it replaced. |
| Planned | Planifié | 已计划 | A run before it is released. |
| In progress | En cours | 进行中 | A released run: its status, Production's filter and Home's tile (ADR-091). |
| Finished | Terminé | 已完成 | A closed run. |

### Invoices and returns

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Issue / Issued | Émettre / Émise | 开具 / 已开具 | An invoice numbered and sent; it never changes. |
| To issue | À émettre | 待开具 | Invoices' filter for the drafts, and Home's tile; each row still says Draft (ADR-091). |
| Void / Voided | Annuler / Annulée | 作废 / 已作废 | An invoice reversed in full by a credit note, or a shipment that never left. |
| Credit | Créditer | 开具贷项 | Give back part of an invoice, by a credit note. |
| Uncollectable | Irrécouvrable | 无法收回 | |
| Replace | Remplacement | 换货 | An RMA's resolution: a new sale at zero. |
| Close RMA / Closed | Clore l’autorisation / Close | 关闭退货授权 / 已关闭 | |
| Open (a return) | En cours | 未结 | Returns' filter and an RMA's status; Home's tile adds the kind: Open returns / Retours en cours / 未结退货 (ADR-091). Orders' Open stays Ouvertes / 未完成. |

### Money and settings

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Base currency | Devise de base | 本位币 | What stock is valued in. |
| Exchange rate | Taux de change | 汇率 | |
| Unit cost | Coût unitaire | 单位成本 | |
| Provisional | Provisoire | 暂估 | A value that still counts stock waiting for a cost. |
| Waiting for a cost | En attente d’un coût | 等待成本 | |
| Registered address | Adresse du siège | 注册地址 | The seller's address on every invoice. |
| What we do | Ce que nous faisons | 业务简介 | One line on the organization's Profile, at most 200 characters, shown on Home under the date (ADR-091). |
| Billing address | Adresse de facturation | 开票地址 | A partner's address marked Invoices go here / Les factures sont envoyées ici / 发票寄往此处; 开票地址 in every place, beside 开票. |
| Tax number | Numéro de taxe | 税号 | The organization's or a partner's number for sales tax, 税号 on every screen and on the PDF alike. The Organization page's field and the PDF name it in full, Tax registration number, Numéro d’inscription aux taxes. |
| Time zone | Fuseau horaire | 时区 | |
| Prefix | Préfixe | 前缀 | A document number's start (ADR-073). |
| Exempt | Exonéré | 免税 | A tax code that charges nothing. |
| Default sale price list | Liste de prix de vente par défaut | 默认销售价目表 | |

### Help and the welcome

| English | Français (Canada) | 简体中文 | Notes |
| --- | --- | --- | --- |
| Help | Aide | 帮助 | The button in the top bar, and the panel it opens (ADR-079). |
| Menu | Menu | 菜单 | The top bar's word under ☰ below `lg`, which opens the drawer (ADR-091). |
| Search | Rechercher | 搜索 | The top bar's word under the search's icon on a phone; the field itself is Search everything / Tout rechercher / 全局搜索. |
| Notifications | Notifications | 通知 | The bell, and its word under it below `lg`. |
| Account | Compte | 账户 | The top bar's word under the person's face below `lg`, which opens the account menu. |
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

## Words not to use

A word a translation does not use, and the word it uses instead: one the
terms above replaced, or one that reads as something else. Where says
where a row holds: Everywhere; Everywhere but, then what it leaves out;
or Only, then all it holds for. A message is named by its id, in either
package's catalogue, `licences.*` for every id under `licences.`; a
guide by its file in `client/src/help/guides/`, in the row's language,
such as `licences.md`. `scripts/i18n-rules.mjs` reads the table and
fails on each word a translation uses where its row holds.

| Language | Not | Instead | Where |
| --- | --- | --- | --- |
| 简体中文 | 产品 | 商品 for the goods sold, 物品 for any item | Everywhere but the licences' regulatory terms: `licences.*`, `permissions.productLicences.*`, `account.access.thing.licences` and `licences.md` |
| 简体中文 | 再订货点 | 库存下限 | Everywhere |
| 简体中文 | 照片 | 头像 | Only where it means a person's picture, not an item's photos: `account.*`, `people.*`, `account.md` and `people.md` |
| 简体中文 | 账单地址 | 开票地址, as Billing address says: 账单地址 sat beside 开票, one address under two names | Everywhere |
| 简体中文 | 税务登记号 | 税号, as Tax number says: the PDF said 税务登记号 where the screens say 税号, one number under two names | Everywhere |
| 简体中文 | 退出该组织 | 离开该组织: a member's own Leave is 离开, as the Account page's button says; 退出 is Sign out's word, 退出登录, where it stays right | Everywhere |
| 简体中文 | 退出组织 | 离开组织, as 退出该组织 says | Everywhere |

## Settled messages

A message whose whole text was decided here, so no round of review
changes it: the decide step (`scripts/i18n-decide.mjs`) keeps its text
whatever a review says, its Reason Settled; `import` refuses a
correction to it, naming it; and `scripts/i18n-rules.mjs` fails where a
catalogue's text for it differs from its row's. A message is named by
its id, in either package's catalogue, and its text is in backquotes,
exactly as the catalogue holds it. A settled message changes only with
its row here, in the same commit as its catalogue.

| Id | Language | Text | Decided in |
| --- | --- | --- | --- |
| `account.title` | 简体中文 | `我的账户` | [ADR-054's November 2026 amendment](adr/0054-languages.md#amendment-november-2026--the-translations-settled-with-no-fluent-reader-chatgpt-leads-two-checks-stand-in): the Account page's title, as its menu item and the guides name it |
| `documents.refusal.signedOut` | 简体中文 | `您尚未登录` | [ADR-054's November 2026 amendment](adr/0054-languages.md#decision--the-words-settled-here): the refused document's page, signed out |
| `invoices.skuLanguageNameWhich` | 简体中文 | `{which, select, variant {{product} 的规格 {sku}（{variation}）} other {{product}（{sku}）}}没有{language}名称，而本组织要求单据上必须有。请在物品页面的“其他语言名称”中添加。` | [ADR-054's November 2026 amendment](adr/0054-languages.md#decision--the-words-settled-here): a missing name's language, in Chinese |
| `mail.invitation.expires` | 简体中文 | `链接只能用一次，有效期到 {date}结束，{zone}。密码由您自己设置。` | [ADR-054's November 2026 amendment](adr/0054-languages.md#decision--the-words-settled-here): the invitation email's last day |

## Placeholders filled with Chinese words

A placeholder that Chinese always fills with Chinese words, the app's
own, never a word a person types. ADR-090's space stands only between
Chinese and Latin letters or digits, so a Chinese message writes none
between its words and one of these: 由{name}提供支持, 无法加载{language},
在{list}中查看全部. Where says where a row holds, as Words not to use
reads it, since one name can mean another value elsewhere: `{list}` in
an order is a price list's name, as typed. `scripts/i18n-rules.mjs`
fails on a space between Chinese and a placeholder listed here, a tag
between or not, and the decide step takes that space out of a text where
it is the text's only problem, saying so in Reason. A placeholder that a
person's or an item's name fills, in Latin letters or Chinese, is not
listed: its message keeps its writer's spacing until #573 settles it. A
guide has no placeholders; where it quotes one of these labels in bold,
`client/src/help/guides.test.ts` holds the quote to the message's
spacing.

| Placeholder | Where | What fills it | Why |
| --- | --- | --- | --- |
| `{language}` | Everywhere | A language's name: 英文, 法文 or 中文 in a sentence, or 简体中文 where Chinese failed to load | The app names a language in the reader's words, as English / French / Chinese (a name's language) above |
| `{languages}` | Everywhere | Languages' names, joined: 英文和法文 | As `{language}` |
| `{role}` | Only `roles.builtIn.note`, `invitation.organization.owner` and `invitation.organization.keep.body` | A built-in role's name: 所有者, 管理员 or 查看者 | The app translates its built-in roles, and these name only one. Elsewhere `{role}` may be a role made here, named as typed |
| `{list}` | Only `search.showAll` and `status.goToList` | A page's name: 物品, 销售订单 | A page's name is the app's own. Elsewhere `{list}` is a price list's name |
| `{tab}` | Everywhere | An item tab's name: 商品, 原材料 | A tab's name is the app's own |
| `{other}` | Only `products.empty.elsewhere` | Another item tab's name | As `{tab}` |
| `{type}` | Only `products.edit.movedTo` and `products.row.type` | An item's type: 商品, 原材料 | A type's name is the app's own |
| `{name}` | Only `brand.poweredBy` | The product's name in Chinese: 品桥 | Set for Chinese on its own, as `VITE_APP_NAME_ZH_HANS` (ADR-082); the rail's foot spaces a Latin one itself (#486) |
| `{lines}` | Only `roles.editor.*` | Permissions' names, each in “ ”, joined | The app names its permissions |
| `{line}` | Only `roles.editor.*` | A permission's name, in “ ” | As `{lines}` |
| `{area}` | Only `roles.editor.*` | An area's name in the role editor: 库存, 订单 | An area's name is the app's own |
| `{permission}` | Only `production.licence.needsOverride` and `roles.permissionRequires` | A permission's name, in “ ” | As `{lines}` |
| `{needs}` | Only `roles.permissionRequires` | Permissions' names, each in “ ”, joined | As `{lines}` |
| `{first}` | Only `settings.numbering.clash` | A document's name: 发票, 装箱单 | A document's name is the app's own |
| `{second}` | Only `settings.numbering.clash` | A document's name | As `{first}` |
| `{problem}` | Only `production.licence.*` | A sentence of the app's about the licence, ending in 。 | Chinese takes no space after 。 |
| `{row}` | Only `products.names.*` | The item or a variant, as the item's page names it: 物品, 规格 {sku} | The app names the row. A variant's ends in its code, whose space beside 的 waits for #573 |

## Writing conventions

- **Apostrophes:** use ’ (U+2019) in translations, never '. An ASCII
  apostrophe is ICU's escape character and can swallow a placeholder.
- **French (Canada):** Quebec typography, as the Office québécois de la
  langue française recommends: no space before ?, ! or ;, a no-break
  space (U+00A0) before : and inside « ». Vouvoiement throughout. This
  holds in the client's and the server's catalogues and the guides alike.
- **Simplified Chinese:** full-width punctuation (，。？：；！), never a
  half-width , ? : ; or ! beside Chinese. A space between Chinese and
  Latin letters or digits, as in 逾期 2 天, 批次 VC-0301 and 我在
  {organization} 的权限 (ADR-090), and none beside full-width punctuation,
  inside a date as the reader's calendar writes it, 2026年11月30日, or
  beside a placeholder that Placeholders filled with Chinese words lists,
  由{name}提供支持. A list joins with 、 and its last item with 和, a
  space beside a Latin name. A plural has its other branch alone, since
  Chinese has no singular form (Intl.PluralRules gives it other only):
  `{count, plural, other {# 个物品}}`. A one branch is never shown,
  whatever it says; =1, exactly one, stands only where the words for one
  differ on purpose, 请先把{items, plural, =1 {它} other {它们}}移到其他分类.
- **Ellipsis:** the single character … in every language, as the English
  uses for "Saving…", never three full stops.
- **Placeholders:** `{name}` and tags like `<link>` are kept exactly, in
  whatever position the sentence needs; `npm run i18n:check` fails
  otherwise.
- **The check:** `scripts/i18n-rules.mjs`, which `scripts/verify.sh`, CI
  and the Docs workflow run, fails on the apostrophes, the ellipsis, Quebec
  typography and the half-width punctuation beside Chinese above, in
  both packages' French and Chinese catalogues and the guides. It fails
  too on a translation the same as its English, ignoring case, spaces
  and punctuation, as "Deleted User" was in a French review, but where
  the English has no word outside its placeholders, as
  `{count} / {max}`, and for the messages its `SAME_AS_ENGLISH` lists by
  language and id, each with why: Total, Code or Lot in French, a unit's
  symbol, a paper size's name. It fails where a settled message's
  text is not its row's in Settled messages, on a space between
  Chinese and a placeholder that Placeholders filled with Chinese words
  lists, and on a message's plural branch for a category its language
  never uses, by Intl.PluralRules: one in Chinese. The decide step drops
  such a branch from a text where it, and those spaces, are the text's
  only problems, saying so in Reason. The space beside Latin letters and
  digits, and how a sentence reads, are left to whoever writes and
  reviews it.

### How it reads

The style round 1's second pass held the wording to (ADR-054's November
2026 amendment), for whoever writes or reviews a translation. It judges
how a sentence reads, never its terms: the tables above win.

- **In both languages:** polite and plain, as a careful colleague
  writes, neither stiff nor chatty. In a guide, a word in bold is the
  screen's own and a link's text names the page it opens, so both stay
  as the screen words them.
- **French:**
  - A button or a menu item is an infinitive, Enregistrer, not
    Enregistrez; a title or a column heading, a noun or an infinitive.
  - French word order, never the English's: no stacked nouns (la liste
    de prix du fournisseur, not la liste prix fournisseur), and no
    English turn of phrase translated word for word.
  - A short status says it once: Enregistré., not A été enregistré avec
    succès.
  - Vouvoiement, without a Veuillez before every request.
  - Quebec usage where it differs from France's, as the terms above are.
- **Chinese:**
  - A short status is 已 and the verb: 已保存, not 保存了 or 保存成功了.
  - No 了 after a verb with its object joined to it: 收货入库：批次
    VC-0301, not 您收货入库了批次 VC-0301. 了 where natural speech has it
    (出错了, 物品快不够了, 有了配方), never only to mark the past.
  - A list of one's own actions is the verb and its object, without 您:
    创建了订单 SO-1, not 您创建了订单 SO-1.
  - No 进行 before a verb: 审核, not 进行审核; nor 对……进行.
  - 您 where a sentence speaks to the person, not in every line.
  - A button, a title or a column heading is as short as its meaning
    allows, with no chain of 的.
