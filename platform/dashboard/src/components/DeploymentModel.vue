<template>
  <div id="deployment-model" style="width: 100%; height: 100%">
    <v-toolbar flat style="padding-right: 300px">
      <v-btn-toggle
        class="d-none d-md-block"
        v-model="viewMode"
        mandatory
        group
        @change="render($event)"
      >
        <v-btn value="tree" icon><v-icon>mdi-graph</v-icon></v-btn>
        <v-btn value="instances" icon><v-icon>mdi-graph-outline</v-icon></v-btn>
        <v-btn value="graph" icon><v-icon>mdi-share-variant</v-icon></v-btn>
        <!--v-btn :value="3" icon><v-icon>mdi-electric-switch-closed</v-icon></v-btn-->
      </v-btn-toggle>
      <v-spacer></v-spacer>
      <!--div class="legend">
        <v-icon>mdi-rectangle</v-icon>
        <span>Composite component</span>
      </div>
      <div class="legend">
        <v-icon>mdi-rectangle-outline</v-icon>
        <span>Basic component</span>
      </div>
      <div class="legend">
        <v-icon>mdi-circle</v-icon>
        <span>Composite instance</span>
      </div>
      <div class="legend">
        <v-icon>mdi-circle-outline</v-icon>
        <span>Basic instance</span>
      </div>
      <div class="legend">
        <v-icon>mdi-ellipse-outline</v-icon>
        <span>Collection</span>
      </div-->
    </v-toolbar>
    <div style="width: 100%; height: 100%; display: flex; flex-direction: row">
      <v-card style="position: relative; width: 100%; height: 100%">
        <div style="position: absolute; right: 0px; top: 0px">
          <div class="legend">
            <v-icon>mdi-rectangle</v-icon>
            <span>Composite component</span>
          </div>
          <div class="legend">
            <v-icon>mdi-rectangle-outline</v-icon>
            <span>Basic component</span>
          </div>
          <div class="legend">
            <v-icon>mdi-circle</v-icon>
            <span>Composite instance</span>
          </div>
          <div class="legend">
            <v-icon>mdi-circle-outline</v-icon>
            <span>Basic instance</span>
          </div>
          <div class="legend">
            <v-icon>mdi-ellipse-outline</v-icon>
            <span>Collection</span>
          </div>
        </div>
        <div
          ref="cytoscape"
          id="cytoscape"
          class="cytoscape"
          style="width: 100%; height: 100%"
        ></div>
      </v-card>
      <div class="deployment-model-propertiesPanel">
        <v-tabs v-model="tab" icons-and-text centered height="50">
          <v-tab>Properties<v-icon>mdi-information-outline</v-icon></v-tab>
          <v-tab>Domains<v-icon>mdi-server</v-icon></v-tab>
        </v-tabs>
        <v-tabs-items v-model="tab">
          <v-tab-item key="info">
            <v-subheader v-if="!selectedNode">No selection</v-subheader>
            <v-row
              v-else-if="selectedNode.data('type') == 'instance-basic'"
              style="padding-top: 20px"
            >
              <v-toolbar
                dense
                class="deployment-model-propertiesToolbar"
                style="margin: 0px 15px"
              >
                <v-icon style="margin-right: 10px">{{ icon }}</v-icon>
                <v-toolbar-title>{{ title }}</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-progress-circular
                  v-if="graph.instances[selectedId].state == 'init'"
                  indeterminate
                  color="primary"
                ></v-progress-circular>
                <v-chip
                  v-else-if="graph.instances[selectedId].state == 'ready'"
                  color="green"
                  dark
                >
                  {{ graph.instances[selectedId].state }}
                </v-chip>
                <v-chip v-else color="red" dark>
                  {{ graph.instances[selectedId].state }}
                </v-chip>
              </v-toolbar>
              <v-col cols="12">
                <v-text-field
                  label="Type"
                  dense
                  outlined
                  readonly
                  :value="
                    graph.instances[selectedId].subcomponent
                      ? 'Subcomponent'
                      : 'Connector'
                  "
                ></v-text-field>
                <v-text-field
                  label="Identifier"
                  dense
                  outlined
                  readonly
                  v-model="graph.instances[selectedId].id"
                ></v-text-field>
                <!--v-text-field
                  label="Parent"
                  dense
                  outlined
                  readonly
                  v-model="graph.instances[selectedId].parent"
                ></v-text-field>
                <v-text-field
                  label="Collection"
                  dense
                  outlined
                  readonly
                  v-model="graph.instances[selectedId].collection"
                ></v-text-field-->
                <v-text-field
                  v-if="graph.instances[selectedId].domain"
                  label="Domain"
                  dense
                  outlined
                  readonly
                  :value="domains[graph.instances[selectedId].domain].title"
                ></v-text-field>
                <v-text-field
                  v-if="graph.instances[selectedId].addr"
                  label="Address"
                  dense
                  outlined
                  readonly
                  v-model="graph.instances[selectedId].addr"
                ></v-text-field>
                <v-text-field
                  v-if="graph.instances[selectedId].proxyAddr"
                  label="Proxy address"
                  dense
                  outlined
                  readonly
                  v-model="graph.instances[selectedId].proxyAddr"
                ></v-text-field>
                <v-btn
                  v-if="graph.instances[selectedId].state == 'ready'"
                  outlined
                  color="red"
                  @click="removeInstance(selectedNode)"
                  >Remove instance</v-btn
                >
              </v-col>
            </v-row>
            <v-row
              v-else-if="selectedNode.data('type') == 'instance-composite'"
              style="padding-top: 20px"
            >
              <v-toolbar
                dense
                class="deployment-model-propertiesToolbar"
                style="margin: 0px 15px"
              >
                <v-icon style="margin-right: 10px">{{ icon }}</v-icon>
                <v-toolbar-title>{{ title }}</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-progress-circular
                  v-if="graph.instances[selectedId].state == 'init'"
                  indeterminate
                  color="primary"
                ></v-progress-circular>
                <v-chip
                  v-else-if="graph.instances[selectedId].state == 'ready'"
                  color="green"
                  dark
                >
                  {{ graph.instances[selectedId].state }}
                </v-chip>
                <v-chip v-else color="red" dark>
                  {{ graph.instances[selectedId].state }}
                </v-chip>
              </v-toolbar>
              <v-divider></v-divider>
              <v-col cols="12">
                <v-text-field
                  label="Type"
                  dense
                  outlined
                  readonly
                  :value="
                    graph.instances[selectedId] == graph.root
                      ? 'Root'
                      : (graph.instances[selectedId].subcomponent &&
                          'Subcomponent') ||
                        'Connector'
                  "
                ></v-text-field>
                <v-text-field
                  label="Identifier"
                  dense
                  outlined
                  readonly
                  v-model="graph.instances[selectedId].id"
                ></v-text-field>
                <v-btn
                  v-if="graph.instances[selectedId].state == 'ready'"
                  outlined
                  color="red"
                  @click="removeInstance(selectedNode)"
                  >Remove instance</v-btn
                >
              </v-col>
            </v-row>
            <v-row
              v-else-if="
                selectedNode.data('type') == 'component-basic' ||
                selectedNode.data('type') == 'component-composite'
              "
              style="padding-top: 20px"
            >
              <v-toolbar
                dense
                class="deployment-model-propertiesToolbar"
                style="margin: 0px 15px"
              >
                <v-icon style="margin-right: 10px">{{ icon }}</v-icon>
                <v-toolbar-title>{{ title }}</v-toolbar-title>
              </v-toolbar>
              <v-col cols="12">
                <v-text-field
                  label="Type"
                  dense
                  outlined
                  readonly
                  :value="
                    selectedNode.data('subcomponent')
                      ? 'Subcomponent'
                      : 'Connector'
                  "
                ></v-text-field>
                <v-btn outlined color="blue" @click="addInstance(selectedNode)"
                  >Add new instance</v-btn
                >
              </v-col>
            </v-row>
            <v-row
              v-else-if="selectedNode.data('type') == 'collection'"
              style="padding-top: 20px"
            >
              <v-toolbar
                dense
                class="deployment-model-propertiesToolbar"
                style="margin: 0px 15px"
              >
                <v-icon style="margin-right: 10px">{{ icon }}</v-icon>
                <v-toolbar-title>{{ title }}</v-toolbar-title>
              </v-toolbar>
              <v-col cols="12">
                <v-text-field
                  label="Name"
                  dense
                  outlined
                  readonly
                  v-model="graph.collections[selectedId].name"
                ></v-text-field>
                <v-text-field
                  v-if="graph.collections[selectedId].addr"
                  label="Address"
                  dense
                  outlined
                  readonly
                  v-model="graph.collections[selectedId].addr"
                ></v-text-field>
                <v-text-field
                  label="Replicas"
                  dense
                  outlined
                  readonly
                  v-model="graph.collections[selectedId].members.length"
                ></v-text-field>
                <v-switch
                  v-model="graph.collections[selectedId].publish"
                  readonly
                  label="Published"
                ></v-switch>
                <!--v-btn outlined color="blue" @click="addInstance(selectedNode)"
                  >Add new instance</v-btn
                -->
              </v-col>
            </v-row>
          </v-tab-item>
          <v-tab-item key="domains">
            <v-row justify="center">
              <v-col cols="8" style="padding-top: 20px">
                <v-switch
                  v-model="domainTracking"
                  label="Track domains"
                  color="red"
                  value="red"
                ></v-switch>
              </v-col>
              <v-col v-if="domainTracking" cols="12">
                <v-data-table
                  :headers="headers"
                  :items="myDomains"
                  :items-per-page="5"
                  :search="filterText"
                >
                  <template v-slot:item.color="{ item }">
                    <v-menu offset-y :close-on-click="true">
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn
                          class="mx-2"
                          fab
                          dark
                          width="24"
                          height="24"
                          v-bind="attrs"
                          v-on="on"
                          :color="item.color"
                        ></v-btn>
                      </template>
                      <v-color-picker
                        dot-size="25"
                        v-model="item.color"
                      ></v-color-picker>
                    </v-menu>
                    <!--v-chip v-if="item.state == 'ready'" color="green" dark>
                  {{ item.state }}
                </v-chip>
                <v-chip v-if="item.state == 'destroy'" color="red" dark>
                  {{ item.state }}
                </v-chip>
                <v-progress-circular
                  v-if="item.state == 'ini'"
                  indeterminate
                ></v-progress-circular-->
                  </template>
                </v-data-table>
              </v-col>
            </v-row>
          </v-tab-item>
        </v-tabs-items>
      </div>
    </div>
  </div>
</template>
<script>
import _ from "lodash";

export default {
  name: "DeploymentModel",
  props: {
    deployment: {
      type: Object,
      required: true,
    },
    mode: {
      type: String,
    },
  },
  data() {
    return {
      tab: "info",
      viewMode: "tree",
      loading: false,
      loaded: false,
      showProperties: true,
      filterText: "",
      domainTracking: false,
      domains: {},
      graph: {},
      selectedId: "",
      headers: [
        {
          text: "DOMAIN",
          align: "center",
          sortable: true,
          value: "title",
        },
        {
          text: "COLOR",
          align: "center",
          sortable: false,
          value: "color",
        },
      ],
      config: {
        style: [
          {
            selector: 'node[type="component-composite"]',
            style: {
              //shape: "polygon",
              //"shape-polygon-points": "-1 1 1 1 1 -1 -1 -1",
              shape: "round-rectangle",
              "background-color": "#666",
              "border-width": "2px",
              label: "data(label)",
            },
          },
          {
            selector: 'node[type="component-basic"]',
            style: {
              /*shape: "polygon",
              "shape-polygon-points": "-1 0.7 -1 1 1 1 1 0.7 -1 0.7 -1 -1 1 -1",
              */ shape: "rectangle",
              width: "40",
              "background-color": "white",
              "border-color": "#666",
              "border-style": "solid",
              "border-width": "2px",
              label: "data(label)",
            },
          },
          {
            selector: 'node[type="component-basic"]:selected',
            style: {
              //"border-style": "dashed",
              "border-width": "5px",
              height: "40",
              width: "60",
              "background-color": "white",
              "border-color": "blue",
            },
          },
          {
            selector: 'node[type="instance-composite"]',
            style: {
              "background-color": "#666",
              label: "data(label)",
            },
          },
          {
            selector: 'node[type="instance-composite"]:selected',
            style: {
              /*"border-style": "dashed",
              "border-width": "5px",
              */ width: "50",
              height: "50",
              "background-color": "blue",
            },
          },
          {
            selector: 'node[type="instance-basic"]',
            style: {
              "background-color": "white",
              "border-color": "#666",
              "border-style": "solid",
              "border-width": "2px",
              label: "data(label)",
            },
          },
          {
            selector: 'node[type="instance-basic"]:selected',
            style: {
              "border-color": "blue",
              //"border-style": "dashed",
              "border-width": "5px",
              width: "50",
              height: "50",
            },
          },
          {
            selector: 'node[type="collection"]',
            style: {
              shape: "ellipse",
              height: 80,
              width: 100,
              "background-color": "white",
              "border-color": "#666",
              "border-style": "solid",
              "border-width": "2px",
              label: "data(label)",
            },
          },
          {
            selector: 'node[type="collection"]:selected',
            style: {
              shape: "ellipse",
              height: 100,
              width: 120,
              //"border-style": "dashed",
              "border-color": "blue",
              "border-width": "5px",
            },
          },
          {
            selector: 'edge[type="link"]',
            style: {
              width: 3,
              "line-color": "#ccc",
              "target-arrow-color": "black",
              //"target-arrow-fill": "black",
              "target-arrow-shape": "triangle",
              "source-label": "data(sourceLabel)",
              "target-label": "data(targetLabel)",
              "source-text-offset": "100",
              "target-text-offset": "100",
            },
          },
          {
            selector: 'edge[type="parent"]',
            style: {
              width: 3,
              "line-color": "#ccc",
              "target-arrow-color": "#ccc",
              "target-arrow-shape": "triangle",
            },
          },
          {
            selector: 'edge[type="include"]',
            style: {
              width: 3,
              "line-color": "#ccc",
              "target-arrow-color": "#ccc",
              "target-arrow-shape": "triangle",
            },
          },
        ],
        layout: {
          name: "breadthfirst",
          fit: true,
        },
      },
      elements: [],
      refreshPeriod: 5000,
    };
  },
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      let type = "read";
      if (!this.deployment.labels) return type;
      for (let label of this.deployment.labels) {
        if (label.startsWith("perm=")) {
          let [name, perm] = label.split("=");
          let [role, right] = perm.split(":");
          if (this.$root.user.roles.includes(role)) {
            if (right == "o") {
              type = "owner";
              break;
            } else if (right == "w" && type != "owner") type = "write";
          }
        }
      }
      return type;
    },
    selectedNode() {
      if (!this.selectedId) return null;
      else return this.cy.nodes(`[id="${this.selectedId}"]`)[0];
    },
    icon() {
      if (!this.selectedId) return "mdi-home";
      else if (this.selectedNode.data("type") == "instance-basic")
        return "mdi-circle-outline";
      else if (this.selectedNode.data("type") == "instance-composite")
        return "mdi-circle";
      else if (this.selectedNode.data("type") == "component-basic")
        return "mdi-rectangle-outline";
      else if (this.selectedNode.data("type") == "component-composite")
        return "mdi-rectangle";
      else if (this.selectedNode.data("type") == "collection")
        return "mdi-ellipse-outline";
      return "mdi-home";
    },
    title() {
      if (!this.selectedId) return "Nothing selected";
      else if (this.selectedNode.data("type") == "instance-basic")
        return "Basic instance";
      else if (this.selectedNode.data("type") == "instance-composite")
        return "Composite instance";
      else if (this.selectedNode.data("type") == "component-basic")
        return "Basic component";
      else if (this.selectedNode.data("type") == "component-composite")
        return "Composite component";
      else if (this.selectedNode.data("type") == "collection")
        return "Collection";
      return "Nothing selected";
    },
    myDomains() {
      return _.map(this.domains, (dom) => dom);
    },
  },
  watch: {
    $route(to, from) {
      // react to route changes...
      this.log(`to: ${to}, from: ${from}`);
    },
  },
  created() {
    window.model = this;
    this.loaded = true;
    this.refresh();
  },
  mounted() {
    this.log("mounted");
    this.cy = this.$cytoscape({
      container: document.getElementById("cytoscape"),
      /*elements: this.elements,*/
      style: this.config.style,
      layout: this.config.layout,
    });
    /*this.cy.on("click", "node", (evt) => {
      this.log("node clicked: " + evt.target[0].data().id);
    });*/
    this.cy.on("select", (ev) => {
      this.select(ev.target);
    });
    this.cy.on("unselect", (ev) => {
      this.unselect(ev.target);
    });

    this.menus = [];
    this.menus.push(
      this.cy.cxtmenu({
        selector:
          'node[type="component-basic"],node[type="component-composite"]',
        menuRadius: 100,
        commands: [
          {
            content: "Add instance",
            select: (node) => {
              this.addInstance(node);
            },
          },
        ],
      }),
      this.cy.cxtmenu({
        selector: 'node[type="instance-basic"],node[type="instance-composite"]',
        menuRadius: 100,
        commands: [
          {
            content: "Remove instance",
            select: (node) => {
              this.removeInstance(node);
            },
          },
          {
            content: "Info instance",
            select: (node) => {
              this.infoInstance(node);
            },
          },
        ],
      })
    );
    this.render();
  },
  destroyed() {
    this.log("destroyed()");
    this.loaded = false;
  },
  updated() {
    this.log("updated");
  },
  /*updated() {
    this.log("updated");
    this.refresh();
    this.render();
  },*/
  methods: {
    log(msg) {
      this.$util.log(`[DeploymentModel] ${msg}`);
    },
    async refresh() {
      this.log(`refresh()`);
      this.refreshDomains();
      this.refreshGraph();
    },
    async refreshDomains() {
      this.log(`refreshDomains(${JSON.stringify(this.deployment)})`);
      try {
        // Obtain domains
        let query = {};
        /*_.each(this.deployment.model.domains, (domId) => {
          query.id = query.id
            ? { $in: _.concat(query.id.$in, domId) }
            : { $in: [domId] };
        });*/
        let domains = await this.$model.listDomains(
          this.$root.user.token,
          query
        );
        for (let id in this.domains) this.$delete(this.domains, id);
        _.each(domains, (dom) => {
          this.domains[dom.id] = {
            id: dom.id,
            title: dom.title,
            state: dom.state,
            color: "#" + Math.floor(Math.random() * 16777215).toString(16),
          };
        });
      } catch (err) {
        this.$root.error(err, "Unable to obtain domains");
        this.$router.back();
      }
    },
    async refreshGraph() {
      this.log(`refreshGraph(${JSON.stringify(this.deployment)})`);

      if (!this.loaded) return;

      // Obtain deployment graph
      //this.loading = true;
      try {
        let [graph] = await this.$model.listGraphs(this.$root.user.token, {
          id: this.deployment.id,
        });
        if (!graph) throw Error(`Graph not found`);

        graph.instances[graph.root.id] = graph.root;
        this.graph = graph;
        //this.log(JSON.stringify(this.graph));

        this.render();
      } catch (err) {
        this.$root.error(err, "Unable to obtain deployment graph");
        this.$router.back();
      } /*finally {
        this.loading = false;
      }*/

      setTimeout(this.refreshGraph.bind(this), this.refreshPeriod);
    },
    refreshColors() {
      this.log(`refreshColors()`);

      // colors
      let styles = this.config.style;
      if (this.domainTracking) {
        Array.prototype.push.apply(
          styles,
          _.map(this.domains, (dom) => {
            return {
              selector: `node[domain="${dom.id}"]`,
              style: {
                "background-fill": "linear-gradient",
                "background-gradient-stop-colors": `white ${dom.color}`,
                //"border-color": dom.color
              },
            };
          })
        );
      } else {
        Array.prototype.push.apply(
          styles,
          _.map(this.domains, (dom) => {
            return {
              selector: `node[domain="${dom.id}"]`,
              style: {
                "background-fill": "solid",
                "background-color": "white",
                /*"background-fill": "linear-gradient",
                  "background-gradient-stop-colors": `white ${dom.color}`,
                  //"border-color": dom.color*/
              },
            };
          })
        );
      }
      this.cy.style().fromJson(styles).update();
    },
    render() {
      this.log(`render()`);

      if (!this.graph.root) return;
      if (!this.loaded) return;

      let compositeInstances = [],
        basicInstances = [],
        compositeComponents = [],
        basicComponents = [],
        collections = [];

      let links = [],
        derives = [],
        includes = [],
        instanceOf = [],
        parents = [];

      _.each(this.graph.instances, (inst) => {
        if (inst.type == "composite") {
          // ---------- composite instance
          let node = {
            data: {
              id: inst.id,
              type: "instance-composite",
              label: inst.subcomponent || inst.connector,
              connector: !!inst.connector,
              subcomponent: !!inst.subcomponent,
            },
          };
          compositeInstances.push(node);

          if (node.data.label && inst.parent) {
            // If parent
            // - add composite component
            let compNode = compositeComponents.find(
              (comp) => comp.data.id == `${inst.parent}/${node.data.label}`
            );
            if (!compNode) {
              compNode = {
                data: {
                  id: `${inst.parent}/${node.data.label}`,
                  type: "component-composite",
                  label: inst.subcomponent || inst.connector,
                  connector: !!inst.connector,
                  subcomponent: !!inst.subcomponent,
                },
              };
              compositeComponents.push(compNode);
            }
            // - add derive edge
            let edge = {
              data: {
                id: `${inst.parent}-${compNode.data.id}`,
                type: "derive",
                source: inst.parent,
                target: compNode.data.id,
                label: "derive",
              },
            };
            derives.push(edge);
            // - add instanceOf edge
            edge = {
              data: {
                id: `${compNode.data.id}-${node.data.id}`,
                type: "instanceOf",
                source: node.data.id,
                target: parent.data.id,
                label: "instanceOf",
              },
            };
            instanceOf.push(edge);
            // - add parent edge
            edge = {
              data: {
                id: `${inst.parent}-${node.data.id}`,
                type: "parent",
                source: inst.parent,
                target: node.data.id,
                label: "parent",
              },
            };
            parents.push(edge);
          }
        } else if (inst.type == "basic") {
          // ---------- basic instance
          let node = {
            data: {
              id: inst.id,
              type: "instance-basic",
              label: inst.subcomponent || inst.connector,
              connector: !!inst.connector,
              subcomponent: !!inst.subcomponent,
              domain: inst.domain,
            },
          };
          basicInstances.push(node);

          // - add basic component
          let compNode = basicComponents.find(
            (comp) => comp.data.id == `${inst.parent}/${node.data.label}`
          );
          if (!compNode) {
            compNode = {
              data: {
                id: `${inst.parent}/${node.data.label}`,
                type: "component-basic",
                label: inst.subcomponent || inst.connector,
                connector: !!inst.connector,
                subcomponent: !!inst.subcomponent,
              },
            };
            basicComponents.push(compNode);
          }
          // - add derive edge
          let edge = {
            data: {
              id: `${inst.parent}-${compNode.data.id}`,
              type: "derive",
              source: inst.parent,
              target: compNode.data.id,
              label: "derive",
            },
          };
          derives.push(edge);
          // - add instanceOf edge
          edge = {
            data: {
              id: `${compNode.data.id}-${node.data.id}`,
              type: "instanceOf",
              source: node.data.id,
              target: compNode.data.id,
              label: "instanceOf",
            },
          };
          instanceOf.push(edge);
          // - add include edge
          edge = {
            data: {
              id: `${inst.collection}-${inst.id}`,
              type: "include",
              source: inst.collection,
              target: inst.id,
              label: "include",
            },
          };
          includes.push(edge);
          // - add parent edge
          edge = {
            data: {
              id: `${inst.parent}-${node.data.id}`,
              type: "parent",
              source: inst.parent,
              target: node.data.id,
              label: "parent",
            },
          };
          parents.push(edge);
        }
      });

      _.each(this.graph.collections, (col) => {
        let node = {
          data: {
            id: col.id,
            type: "collection",
            label: col.name,
          },
        };
        collections.push(node);
      });

      _.each(this.graph.links, (link) => {
        let edge = {
          data: {
            id: link.id,
            type: "link",
            source: link.src,
            sourceLabel: link.srcName,
            target: link.dst,
            targetLabel: link.dstName,
            label: "link",
          },
        };
        links.push(edge);
      });

      if (this.viewMode == "tree") {
        // ----------------- tree  -----------------

        // - add root
        let root = {
          data: {
            id: this.graph.root.id,
            type: "instance-composite",
            label: "root",
          },
        };
        compositeInstances.unshift(root);

        let data = {
          elements: _.concat(
            compositeInstances,
            compositeComponents,
            basicInstances,
            basicComponents,
            instanceOf,
            derives
          ),
        };

        this.log(`${JSON.stringify(data)}`);

        this.cy.json(data); //.layout(layout).run();

        this.refreshColors();

        let layout = {
          name: "breadthfirst",
          animate: true,
          roots: `#${root.data.id}`,
          fit: true,
        };
        this.cy.layout(layout).run();

        /*if (!this.loaded) {
          let layout = {
            name: "breadthfirst",
            animate: true,
            roots: `#${root.data.id}`,
            fit: true,
          };
          this.cy.layout(layout).run();
          this.loaded = true;
        }*/
      } else if (this.viewMode == "instances") {
        // ----------------- instances  -----------------

        // - add root
        let root = {
          data: {
            id: this.graph.root.id,
            type: "instance-composite",
            label: "root",
          },
        };
        compositeInstances.unshift(root);

        let data = {
          elements: _.concat(compositeInstances, basicInstances, parents),
        };

        //this.log(`${JSON.stringify(data)}`);

        this.cy.json(data); //.layout(layout).run();
        this.refreshColors();

        let layout = {
          name: "breadthfirst",
          animate: true,
          roots: `#${root.data.id}`,
          fit: true,
        };
        this.cy.layout(layout).run();
        this.loaded = true;
      } else if (this.viewMode == "graph") {
        let data = {
          elements: _.concat(collections, basicInstances, links, includes),
        };

        // this.log(`${JSON.stringify(data)}`);

        this.refreshColors();

        let layout = {
          name: "breadthfirst",
          animate: true,
          roots: `node[type="collection"]`,
          directed: true,
        };
        this.cy.json(data).layout(layout).run();
      }
    },

    async addInstance(node) {
      this.log(`addInstance(${node.id()})`);

      let [parent, name] = node.id().split("/");
      let opts = {
        parent: parent,
        subcomponent: node.data("subcomponent") ? name : undefined,
        connector: node.data("connector") ? name : undefined,
      };
      this.loading = true;
      try {
        let tx = await this.$model.addInstance(this.$root.user.token, opts);
        this.$root.success("The instance is being added", 5000);
      } catch (err) {
        this.$root.error(err, "Unable to add instance", 5000);
        return;
      } finally {
        this.loading = false;
      }
    },
    async removeInstance(node) {
      this.log(`removeInstance(${node.id()})`);

      this.loading = true;
      try {
        let tx = await this.$model.removeInstance(
          this.$root.user.token,
          node.id()
        );
        this.$root.success("The instance is being removed", 5000);
      } catch (err) {
        this.$root.error(err, "Unable to remove instance", 5000);
        return;
      } finally {
        this.loading = false;
      }
    },
    infoInstance(instanceId) {
      this.log(`infoInstance(${instanceId})`);
    },
    select(node) {
      this.log(`select(${node.id()},${node.data("type")})`);
      let nodeType = node.data("type");
      switch (nodeType) {
        case "instance-basic":
        case "instance-composite":
        case "component-basic":
        case "component-composite":
        case "collection":
          this.selectedId = node.id();
          this.tab = "info";
          break;
        default:
          this.selectedId = "";
      }
    },
    unselect(node) {
      this.log(`unselect(${node.id()})`);
      this.selectedId = "";
    },
  },
};
</script>
<style scoped>
.deployment-model-propertiesShow {
  display: flex;
  height: 100%;
  align-items: center;
}
.deployment-model-propertiesPanel {
  /*background-color:black; */
  min-width: 350px;
  max-width: 350px;
  overflow: auto;
  padding: 0px 15px;
}
.legend {
  display: inline-flex;
  font-size: 0.75em;
  flex-direction: column;
  margin: 10px;
}
.deployment-model-propertiesToolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 5px 10px 10px 5px;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
}
</style>