# Production

A production run consumes components and produces a finished item, made by you or by a contract manufacturer. A run needs a recipe, which lives on the product’s page.

## Plan a run {#plan}

1. Press **Plan a run**.
2. Choose what you are **Making**, and its **Recipe**.
3. Enter the **Quantity to make**. The components scale from the recipe to whatever you enter.
4. Choose where it is **Made at**: components are issued there, and the output is received there.
5. Choose the **Contract manufacturer**, or **We make it ourselves**, and press **Plan run**. Nothing moves yet.

> Only someone who may plan runs sees **Plan a run**.

## Release a run {#release}

1. Open the planned run and press **Release**.
2. Choose where to **Pick components from**. Lots are taken earliest expiry first, or **Choose lots** to pick them yourself.
3. Press **Release**. The recipe is copied onto the run and the components move to where it is made, so editing the recipe later cannot change this run.

> Only someone who may release runs sees **Release** and **Cancel run**.

## Record output and close {#close}

1. As finished units come off the line, press **Record output** and enter what was **Finished this time**, into the same batch or a new one. A batch made over several days is recorded a bit at a time.
2. When the run is done, press **Close run** and enter what was **Actually used**. More than planned is fine; anything left over stays where the run is, to be put away by hand.

> Only someone who may finish runs sees **Record output** and **Close run**.

## Words you’ll meet {#words}

- **Recipe**: what a product is made from. The version runs use is the one promoted on the product’s page.
- **Component**: what a recipe consumes.
- **Batch**: what a run makes, traced as a received lot is.
- **Planned**, **In progress**, **Finished**: a run before release, after it, and once closed.

## If something is refused {#refused}

- A run with no recipe can be planned but not released. Create a recipe on the product’s page and promote it, then release.
- A location short of a component cannot release the run. Move the stock there first, or pick from another location. Stock held for confirmed sales is not taken.
- A licence that has expired, is not yet in force or was withdrawn can stop a release, as the [licence policy](/settings/organization#licences) says. Someone who may override it can release with a reason, kept on the run.
- Cancelling does not carry issued components back: somebody has to move them.

See also [Products](/products) and [Lots](/lots).
