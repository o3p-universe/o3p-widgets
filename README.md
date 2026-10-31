# O3P Widgets

Odoo 20 addon providing shared O3P web widgets and their common settings.

The **O3P Widgets** area in General Settings includes a **Minimum text lines**
option. It defaults to Odoo's native `2` lines when the addon is first installed.
Other positive values adjust text fields in 25-pixel increments; explicit `rows`
attributes are preserved. Setting changes apply after a browser refresh.

The same settings area includes **Minimum list lines**, defaulting to Odoo's
native `4`. It controls the minimum row count in list and embedded one-to-many
views; an available **Add a line** row counts toward the configured total. A
value of `0` removes filler rows. The native renderer remains unpatched at `4`.

Notebook tabs are remembered locally for each browser, normalized Odoo-relative URL,
and notebook position in the page's `.o_notebook` selector result. URL query and hash
parameters are discarded except for `id` and `model`. When a page is reopened, each
notebook restores its most recently selected visible tab. Saved entries expire
automatically after 48 hours. Storage failures never block the interface and are
reported only as browser console warnings. The feature can be disabled with
**Remember notebook tabs** in the O3P Widgets settings area and is disabled by
default on first install.

The independent **Default notebook tabs** option applies administrator-defined
URL-prefix rules only when no exact browser memory exists. The longest matching
prefix wins, and its zero-based tab index selects the initial tab. Rules are
stored as generic `o3p.widget.memory` records with the memory type `lastnbtab`;
the settings list presents their text and numeric values as **URL Prefix** and
**Tab Index (from 0)**. This option is also disabled on first install.

After enabling **Enable support of accordion="true" for groups** in O3P Widgets
settings, form groups can opt into a collapsed accordion presentation with the
`accordion="true"` architecture attribute:

```xml
<group string="Additional details" accordion="true">
    <field name="notes"/>
</group>
```

An accordion automatically starts collapsed when all of its fields are empty,
and open when at least one field has a value. Selecting its title overrides
that automatic state. Groups without the attribute, or with
`accordion="false"`, retain Odoo's standard rendering.

The separate **Sticky accordion open-close status** setting remembers each
accordion's last user-selected state in that browser. Entries are indexed by
the normalized page URL and the accordion's zero-based position in the page's
`.o3p_accordion_group` selector result. They expire after one month; until then,
the remembered state takes precedence over automatic field inspection. Both
accordion settings are disabled by default on first installation.

The **Odoo UI Settings** area includes an **Enable resizable chatter** switch.
When enabled, the left edge of a side chatter can be dragged to resize it;
double-clicking the resize edge restores Odoo's default width. The width is
remembered in the current browser. The implementation attaches to Odoo's
rendered chatter element and safely restores its handle after an Owl rerender,
without replacing or rewriting the form compiler.

The **Enable scroll loading** option in **Odoo UI Settings** is disabled by
default. When enabled, scrolling within 100 pixels of the bottom of an ungrouped
list or kanban view increases the visible range by up to 80 records. Existing
visible records stay in the range; Odoo reloads that range through its model API.
A **Load all** button loads all matching records from the start, asking for
confirmation above 5,000 records. Grouped views, embedded relation fields, sample
data, offline views, and lists with an active inline edit retain native behavior.
Failed requests can be retried. Refresh the browser after changing the setting.
