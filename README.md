# Table node (using Tabulator) for Node-RED Dashboard 2.0

A short summary of the node's functionality & configuration options. Complete, detailed reference is provided in the node's on-line help, available in the Node-RED editor.

> **Note:** the node comes in addition to, not replacing, dashboard v2.0's native vue-based **table** node.
# ui-tabulator
The **ui-tabulator** custom node serves as a container for the popular [Tabulator](https://www.tabulator.info) JavaScript package, for presentation & management of UI tables. The node follows the concept of the **ui-table** node of dashboard v1.0, but with significantly richer functionality.
At the moment, the node exposes a basic set of capabilities out of the vast feature-set of tabulator. As we move forward, the node can evolve to expose more tabulator capabilities, according to feedback from the user community.
#### General Overview
* The node serves as a smart wrapper containing a Tabulator (table) object. For the most part, it calls the Tabulator API as-is (as defined in the [Tabulator Documentation](https://tabulator.info/docs/6.2)).
* The node enables automatic instantiation of the table (with user-defined configuration & initial data), as well as dynamic table create/destroy in runtime.
* Interface to the node is through messages (regular Node-red **msg** objects). The msg specifies a command, and returns the table's response
* In addition, the node can send unsolicited event messages for selected table events (on-create, on-change etc.)
> **Note:** Messages sent to the node are gauranteed to return unchanged (except for **payload** with returned data and an **error** property in case of failure). This allows calling the tabulator node from **link-call** nodes. However, if events are enabled, they need to be side-tracked and bypass the link-return node (as they do not have a caller return address)
* In addition to messaging, there is an option to call the table object API directly from other **template** nodes, in case the required functionality cannot be sent in a message (for example: setting a conditional-formatting expression, which cannot be serialized into a message without breaching security).
* By default, the table operates in **_shared_** mode, i.e. multiple concurrent clients see the same data image. In this mode, a snapshot of the current table data is retained in the Node-red datastore, and reloaded upon browser open, refresh etc.  
The node also supports a **_Multi-User_** mode, which allows per-client table-data & messaging.
#### Node Configuration
The node configuration properties (in the editor):
* **Name, Group, Size**: - same as in all dashboard nodes
* **Initial Table Configuration**: JSON object with all table & column definitions, and (optional) initial data
* **Notifications**: selection of table events to be sent
* **Multi-user** mode: (Y/N)
* **CSS theme**: selection of a tabulator theme (light, dark etc.)
* **Table Id**: optional unique Id for getting direct API access to the tabulator object from other dashboard **_template_** nodes
* **Pass through message from input**: will forward the incoming message as-is to the output port, **_in addition_** to the node'e response
#### Supported Commands
* **General:** createTable, destroyTable, saveToDatastore, clearDatastore
* **Data update:** setData, replaceData, updateData, addData, updateOrAddData, addRow, updateRow, deleteRow, updateOrAddRow, clearData
* **Data Retrieval:** getData, getDataCount, getRow, searchData, getSelectedData,
* **Table Appearance:** setStyle(cell/row/column/table), showColumn, setSort, setFilter, getFilters, addFilter, removeFilter, clearFilter
* **Misc:** selectRow, deselectRow, download
> **Note:** It is possible to call additional, read-only tabulator APIs beyond the ones listed above. However, they will fail if their returned data is not serializable into the returned msg
#### Supported Events
* tableBuilt, tablePreDestroy, tableDestroyed
* rowClick, rowDblClick, rowTap, rowDblTap, rowTapHold
* rowAdded, rowUpdated, rowDeleted
* cellClick, cellDblClick, cellTap, cellDblTap, cellTapHold
* cellEdited
* dataChanged, dataFiltered
#### Node Dependencies
* Node-JS version >= 18
* Node-red version >= 3.10
* Node-red dashboard 2.0, version >= 1.6.0
* Tabulator version >= 6.2 (comes bundled in the node installation)
