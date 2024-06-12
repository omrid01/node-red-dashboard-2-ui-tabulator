# About _ui-tabulator_
The **ui-tabulator** custom node uses the popular [Tabulator](https://www.tabulator.info) JavaScript package, for updating, querying & presentation of UI tables.
> **Note:** the node comes in addition to, not replacing, dashboard V2.0's native vue-based **table** node.

This repository contains a third-party, community node for the Node-RED Dashboard v2.0. You can read the [contribution guide](https://dashboard.flowfuse.com/contributing/widgets/third-party.html) for details on developing your own Dashboard 2.0 integrations & widgets.


Note that if you're looking to contribute directly to Node-RED Dashboard 2.0, then use the examples already in the core repository to build on, as they are structured differently to external/third-party widgets.

## Architecture

All third-party (non-core) nodes for Node-RED Dashboard 2.0 are structured such that they extend the core `ui-template` node, and provide access such that you can define custom HTML, CSS, and JavaScript for your widget.
