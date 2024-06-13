# Table node (using Tabulator) for Node-RED Dashboard 2.0

A short summary of the node's design concepts, functionality & configuration options. Complete, detailed usage reference is provided in the node's on-line help, available in the Node-RED editor.
# ui-tabulator
![example-pic](https://github.com/omrid01/node-red-dashboard-2-table-tabulator/assets/100078999/2e7bac34-94e3-49c1-bd69-cdb3dade5abd)

The **ui-tabulator** custom node uses the popular [Tabulator](https://www.tabulator.info) JavaScript package, for updating, querying & presentation of UI tables.
> **Note:** the node comes in addition to, not replacing, dashboard V2.0's native vue-based **table** node.

#### General Overview
* The node serves as a smart wrapper containing a Tabulator (table) object. For the most part, it calls the Tabulator API as-is (as defined in the [Tabulator Documentation](https://tabulator.info/docs/6.2)).
* The node enables automatic instantiation of the table (with user-defined configuration & initial data), as well as to dynamically create/destroy  tables in runtime.
* Interface to the node is through messages (regular Node-red **msg** objects). The msg specifies a command (and arguments), and returns the table's response
* The node accepts data-setting commands (e.g. setData, addData, updateData, deleteData etc.) as well as data-query commands (getData, searchData etc.)
* In addition, the node can send unsolicited event messages for selected table events (cell & row click/double-click, cell edit etc.)
* By default, the table operates in **_shared_** mode, i.e. a common table image (data + styling) in all concurrent dashboard clients. The table image is also cached in the Node-RED datastore, and reloaded upon browser open, refresh etc.  
The node also supports a **_Multi-User_** mode, which maintains independent, client-specific table data with "private" messaging.
> **Note:** even in **shared** mode, the node enables client-specific appearance & interaction (e.g. sorting, filtering, row selection etc.) on top of the common table image.
#### Message Examples
* Data-setting command example
```
msg.tbCmd  = "addData";
msg.tbArgs = [
   [
      {id:1, name:"bob", gender:"male"},
      {id:2, name:"Jenny", gender:"female"}
   ],
   true
];
```
* Data-retrieval command example
```
msg.tbCmd  = "searchData";
msg.tbArgs = [ "age", ">", 12 ];
```
* Event example
```
{
    topic: "tbNotification",
    event: "cellEdited",
    payload: {
        id: 2,
        field: "name",
        newValue: "Jack Brown",
        oldValue: "John Doe"
    },
    _client: {
        socketId: "uXRxjY9yO-Hya1vtAAAB"
    },
    _msgid:"6d9d7a97666f2783"
}
```
#### Node Configuration
The node configuration properties (in the editor):
* **Name, Group, Size**: - same as in all dashboard 2.0 nodes
* **Initial Table Configuration**: JSON object with all table & column definitions, and (optional) initial data
* **Notifications**: selection of table events which trigger notification messages
* **Multi-user** mode: (Y/N)
* **CSS theme**: selection of an optional tabulator CSS Stylesheet (e.g. **_Midnight_**, **_Modern_** etc.)
* **Pass through message from input**: if checked, forwards the incoming message as-is to the output port, **_in addition_** to the node'e response
#### Architectural Concepts in Multi-Client Environment
Tabulator table objects are instantiated in the client (browser) page. Hence, when there are multiple dashboard clients, a single **_ui-tabulator_** node instance, is associated to multiple table objects. Per Node-RED's framework, every message sent to a **_ui-tabulator_** node in a flow, is replicated to all of its **_widgets_** (client UI elements, i.e. table objects). If the table object responds, the flow will receive multiple, identical responses (one per client). To enable a **_Shared_** mode, where all table widgets are synchronized and have a common data image, we do the following:
* Data-setting & styling commands sent from the **_ui-tabulator_** node in flow to all table widgets in parallel, thus appying the same changes on the widgets
* The (identical) table responses to command messages are grouped by **_msgid_**, and only a single response is returned to the flow
* When a user changes table data directly on the UI of any client, an update notification is automatically sent to all other clients
* The current table data image is always saved in the Node-RED datastore, automatically restoring the table image upon client open/refresh.

Having said the above, some table presentation aspects (on top of the common data image) are user-related by nature, and are not synchronized. For example, users may want to set their own filtering/sorting, or select specific rows for further actions. In such cases, each client table returns a different response to data query commands. In such cases, the command should be scoped to a specific table widget (by specifying the client Id, or initiating the command from a dashboard objet, e.g. button, on the same client)
#### Node Dependencies
* Node-JS version >= 18
* Node-red version >= 3.10
* Node-red dashboard 2.0, version >= 1.11.1
* Tabulator version >= 6.2 (comes bundled in the node installation)
