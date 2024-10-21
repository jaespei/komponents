<template>
  <!-- Main component container -->
  <div class="composite-internals-container">
    <!-- 
      Scrollable container
      - It embeds the diagram, which is bigger than the container size
      - Required for creating the sibling overlay     
    -->
    <div
      ref="container"
      class="composite-internals-scrollable"
      :style="componentRoute == '' ? 'overflow: hidden;' : 'overflow: auto;'"
    >
      <!--
        Component menu
        - Shown when a subcomponent/connector gets selected
      -->
      <component-menu
        class="component-menu"
        ref="menu"
        v-if="
          actionContext.selectedCell && !actionContext.dragging && action.menu
        "
        :actions="action.menu"
        :top="actionContext.menuTop"
        :left="actionContext.menuLeft"
        @action="onMenuAction"
      ></component-menu>
      <!--
        Diagram paper
      -->
      <div
        class="composite-internals-paper"
        ref="paper"
        @pointermove="mouseEvent('move', $event)"
      ></div>

      <!--div
        class="composite-internals-paper"
        ref="paper"
        @pointermove="mouseEvent('move', $event)"
        @pointerdown="mouseEvent('down', $event)"
        @pointerup="mouseEvent('up', $event)"
      ></div-->
    </div>
    <!-- 
      Overlay
      - It gets inserted on top of the scrollable content to get user
        interaction and control all actions (hiding the diagram default behavior)
    -->
    <div
      ref="overlay"
      v-if="showOverlay"
      class="composite-internals-overlay"
      :style="{ cursor: cursor }"
      @pointermove="mouseEvent('move', $event)"
      @pointerdown="mouseEvent('down', $event)"
      @pointerup="mouseEvent('up', $event)"
      @mouseenter="mouseEvent('enter', $event)"
      @mouseleave="mouseEvent('leave', $event)"
    >
      <!--
        This two elements are shown as gray shades on top of the overlay while 
        adding new subcomponents/connectors
      -->
      <div ref="component" class="composite-internals-component"></div>
      <div ref="connector" class="composite-internals-connector"></div>
    </div>
  </div>
</template>

<script>
import joint from "./joint";
import dagre from "dagre";
import graphlib from "graphlib";
import _ from "lodash";
import Clay from "clay.js";
import common from "./common";
import ComponentModel from "./models/ComponentModel";
import BasicViewModel from "./viewmodels/BasicViewModel";
import CompositeViewModel from "./viewmodels/CompositeViewModel";
import ConnectorViewModel from "./viewmodels/ConnectorViewModel";
import ComponentView from "./views/ComponentView";
import LinkViewModel from "./viewmodels/LinkViewModel";
import LinkView from "./views/LinkView";
import ComponentMenu from "./ComponentMenu";

/**
 * Component Model Viewer.
 * This component paints the component model diagram and allows interaction.
 * Inputs:
 * - components: contains the description of all components
 * - layout: contains the layout of each component (subcomponents positions)
 * - display: contains the display of each component (scale, translate, scroll)
 * - path: describes the path of the component to show
 * - action: the current active action, when the user clicks on the diagram
 * Events:
 * - change({type('layout','display'),path,value): triggered whenever a change is detected in the layout/display
 * - action({type:<click, dblclick>}value)
 * Refs:
 * - Container resise: HTML elements do not have a resize event, only window. The paper needs to change
 *   its size according to its container. To that end we use clay.js http://zzarcon.github.io/clay/
 *   Another available option would be: https://web.dev/resize-observer/
 */
export default {
  name: "CompositeInternals",
  components: {
    ComponentMenu,
  },
  props: {
    components: { type: Object, required: true },
    componentsLayout: { type: Object },
    componentsDisplay: { type: Object },
    componentRoute: { type: String },
    action: { type: Object },
    mode: { type: String, default: "write" },
  },
  data() {
    return {
      currentRoute: this.componentRoute,
      actionContext: {},
      currentActionName: "", // for destroying previous action context
      cursor: "default",
      showOverlay: false,
      background: {
        //color: "antiquewhite",
        color: this.componentRoute ? "white" : "lightgray",
      },
      gridSize: 10,
      drawGrid: {
        name: "mesh",
      },
    };
  },
  computed: {
    component() {
      return common.findComponentByRoute(this.components, this.currentRoute);
    },
  },
  watch: {
    /* components: {
      deep: true,
      handler(value, old) {
        this.onModelChange();
      },
    },*/
    componentRoute(value) {
      this.$util.log(`[CompositeInternals] watch.componentRoute(${value})`);
      // if route changes reload everything
      this.load();
    },
    action: {
      // if action changes then react
      deep: true,
      handler(value, old) {
        this.onAction();
      },
    },
  },
  created() {
    this.$util.log(`[CompositeInternals] created()`);
    window.viewer = this;

    // Cache original model, to keep track of diffs
    this.componentsCache = _.cloneDeep(this.components);

    this.name = this.$options.name;
    //this.actionContext = {};
  },
  mounted() {
    this.$util.log(`[${this.name}] Mounted:`, this.$refs.paper);

    // - when parent window resizes, we have to redisplay
    /*this.clay = new Clay(this.$refs.container);
    this.clay.on("resize", (ev) => {
      this.$util.log(`[CompositeInternals] resize(${JSON.stringify(ev)})`);
      let display = {};
      if (!this.currentRoute.length) {
        display = {
          scale: 2,
          container: {
            width: this.$refs.container.offsetWidth,
            height: this.$refs.container.offsetHeight,
          },
          margin: {
            left: 0.1,
            right: 0.1,
            top: 0.1,
            bottom: 0.1,
          },
          fullscreen: true,
        };
      } 
      this.doDisplay(display);
    });*/

    this.graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes });

    // - create paper
    this.paper = new joint.dia.Paper({
      el: this.$refs.paper,
      //cellViewNamespace: joint.shapes,
      model: this.graph,
      width: this.$refs.container.offsetWidth,
      height: this.$refs.container.offsetHeight,
      //gridSize: this.gridSize,
      elementView: ComponentView,
      linkView: LinkView,
      defaultRouter: {
        name: "manhattan",
        startDirections: ["right"],
        endDirections: ["right"],
        args: { padding: 10 },
      },
      defaultConnector: {
        name: "jumpover",
        type: "arc",
      },
      //linkView: LinkView,
      //drawGrid: this.drawGrid,
      // background: { color: "lightgray" },
      interactive: false,
      validateConnection: () => {
        return false;
      },
      validateMagnet: () => {
        return false;
      },
    });

    // Register paper events
    // - In JointJS it is not easy to find links given a point, so
    //   we need to use this mechanism for selecting links

    this.paper.on("cell:pointerclick", (cellView, evt, x, y) => {
      this.$util.log(`[Paper] cell:pointerclick`);
      if (this.action.name == "pointer") {
        // - pointerdown does not work with links; only
        //   pointerclick. We need to simulate
        if (cellView.model.isLink()) {
          this.$set(this.actionContext, "overCell", cellView.model);
          this.pointerDown(evt);
        }

        // - in mobile mode, dblclick event is not triggered
        //   we need to simulate it
        if (this.clickTime && Date.now() - this.clickTime < 200) {
          delete this.clickTime;
          this.pointerDblClick(evt);
        } else {
          this.clickTime = Date.now();
        }
      }
    });
    this.paper.on("cell:pointerdblclick", (cellView, evt, x, y) => {
      //this.$util.log(`[Paper] cell:pointerdblclick`);
      if (this.action.name == "pointer") {
        // - overwrite "overCell" to set link
        this.$set(this.actionContext, "overCell", cellView.model);
        this.pointerDblClick(evt);
      }
    });
    this.paper.on("cell:pointerdown", (cellView, evt, x, y) => {
      this.$util.log(`[Paper] cell:pointerdown`);
      if (this.action.name == "pointer") {
        this.$set(this.actionContext, "overCell", cellView.model);
        this.pointerDown(evt);
      }
    });
    this.paper.on("cell:pointerup", (cellView, evt, x, y) => {
      //this.$util.log(`[Paper] cell:pointerup`);
      this.pointerUp(evt);
    });
    this.paper.on("blank:pointerdown", (evt, x, y) => {
      //this.$util.log(`[Paper] blank:pointerdown`);
      if (this.action.name == "pointer") {
        this.$util.log(`[Paper] blank:pointerclick`);
        this.$delete(this.actionContext, "overCell");
        this.$delete(this.actionContext, "overPort");
        this.pointerDown(evt);
      }
    });
    /*this.paper.on("cell:mouseover", (cellView, evt, x, y) => {
      this.$util.log(`[Paper] cell:mouseover`);
    });*/

    /*this.paper.on("paper:mouseenter", (evt) => this.mouseEvent("enter", evt));
    this.paper.on("paper:mouseleave", (evt) => this.mouseEvent("enter", evt));
    this.paper.on("cell:pointerdblclick", () => this.$util.log("Double click!!"));*/

    // - Notify layout changes to parent
    this.graph.on("change:position", (elem, position, opt) => {
      this.$util.log(
        `[CompositeInternals] change(${elem.get("id")}, ${JSON.stringify(
          position
        )})`
      );

      // A cell has moved
      //
      // - we need to move the menu too
      this.doMenu();

      // - we trigger the event upwards
      let ev = {
        type: "layout",
        /*path: elem.get("id"),
        name: "position",
        value: position,*/
        value: this.getLayout(),
      };
      this.$emit("change", ev);
    });

    // - load for the first time, nothing to save
    this.load({ nosave: true });
    this.onAction();
  },
  beforeDestroy() {
    this.$util.log(`[${this.name}] beforeDestroy()`);
    //this.clay.reset();
    this.unload();
    delete this.clay;
  },
  methods: {
    /**
     * Handler called when a component menu options is selected.
     *
     * @param {Object} ev - The event data
     */
    onMenuAction(ev) {
      this.$util.log(`[CompositeInternals] onMenuAction(${JSON.stringify(ev)})`);
      this.$emit("action", ev);
    },
    /**
     * Handler called when a new change is detected in the model.
     *
     * @param {string} id - The @id of the component updated
     */
    onModelChange(id) {
      this.$util.log(`[CompositeInternals] onModelChange(${id})`);
      // if the change affects the current container

      if (id == this.component[`@id`]) {
        this.$util.log("change detected in main container");

        let diff = this.diff(this.component, this.cachedComponent);
        let diffInverse = this.diff(this.cachedComponent, this.component);

        this.$util.log(`diff=${JSON.stringify(diff)}`);
        this.$util.log(`diffInverse=${JSON.stringify(diffInverse)}`);

        this.cachedComponent = _.cloneDeep(this.component);

        // Detect endpoint changes
        _.each(diff.endpoints, (ep, epId) => {
          if (ep[`@id`] && ep.type == "in") {
            // - refresh mapping connector
            let cell = this.graph.getCell(ep.mapping);
            cell.set("published", true);
            cell.refresh();
          }
        });
        _.each(diffInverse.endpoints, (ep, epId) => {
          if (ep[`@id`] && ep.type == "in") {
            // - refresh mapping connector
            let cell = this.graph.getCell(ep.mapping);
            cell.set("published", false);
            cell.refresh();
          }
        });

        // 1. Detect subcomponent changes
        _.each(diff.subcomponents, (subcomp, subcompId) => {
          if (subcomp[`@id`]) {
            // New subcomponent was added
            this.$util.log(` ---> new subcomponent added`);
            
            let subcompType = common.findComponentByRoute(
              this.components,
              common.route(this.currentRoute, subcomp[`@id`])
            );

            // register new watch on component type
            if (
              !_.find(
                this.destroyers,
                (destroyer) => destroyer.id == subcompType[`@id`]
              )
            ) {
              this.destroyers.push({
                id: subcompType[`@id`],
                fn: this.$watch(
                  () => subcompType,
                  (newVal, oldVal) => {
                    this.onModelChange(subcompType[`@id`], newVal, oldVal);
                  },
                  { deep: true }
                ),
              });
            }

            let cell;
            if (subcompType.type === "basic") {
              cell = new BasicViewModel({
                id: subcomp[`@id`],
                name: subcomp[`@name`],
                mode: (subcompType[`@origin`] && "read") ||
                      (subcompType[`@opaque`] && "locked") ||
                      "write",
                component: subcompType[`@id`],
                variables: subcompType.variables,
                endpoints: subcompType.endpoints,
                volumes: subcompType.volumes,
              });
            } else if (subcompType.type === "composite") {
              cell = new CompositeViewModel({
                id: subcomp[`@id`],
                name: subcomp[`@name`],
                mode: (subcompType[`@origin`] && "read") ||
                      (subcompType[`@opaque`] && "locked") ||
                      "write",
                component: subcompType[`@id`],
                variables: subcompType.variables,
                endpoints: subcompType.endpoints,
                volumes: subcompType.volumes,
              });
            }
            if (subcomp[`@layout`]) {
              //let subcompLayout = JSON.parse(subcomp[`@layout`]);
              let subcompLayout = subcomp[`@layout`];
              // - matching layout found
              if (subcompLayout.position)
                cell.set("position", subcompLayout.position);
              if (subcompLayout.size) cell.set("size", subcompLayout.size);
              if (subcompLayout.endpoints) {
                _.each(subcompLayout.endpoints, (ep) => {
                  cell.updatePort({
                    id: ep.id,
                    position: ep.position,
                  });
                });
              }
            }
            this.graph.addCell(cell);
          } else if (subcomp[`@name`]) {
            this.$util.log("subcomponent name changed");
            let cell = this.graph.getCell(subcompId);
            cell.set("name", subcomp[`@name`]);
            cell.refresh();
          } else if (subcomp["@color"]) {
            this.$util.log("subcomponent color changed");
            let cell = this.graph.getCell(subcompId);
            cell.set("color", subcomp[`@color`]);
            cell.refresh();
            // little hack: don't know why body color does not refresh
            let view = this.paper.findViewByModel(cell);
            view.render();
            // - trigger layout change
            this.$emit("change", { type: "layout", value: this.getLayout() });
          }
        });

        // 2. Detect subcomponent removals
        _.each(diffInverse.subcomponents, (subcomp, subcompId) => {
          if (subcomp[`@id`]) {
            this.$util.log(` ---> subcomponent removed`);
            let cell = this.graph.getCell(subcomp[`@id`]);
            this.graph.removeCells(cell);

            // unregister watch on component type
            if (
              !_.find(
                this.graph.getCells(),
                (_cell) => _cell.component == cell.component
              )
            ) {
              let index = this.destroyers.findIndex(
                (destroyer) => (destroyer.id = cell.component)
              );
              if (index != -1) {
                this.destroyers[index].fn();
                this.destroyers.splice(index, 1);
              }
            }
          }
        });

        // 3. Detect connector changes
        _.each(diff.connectors, (con, conId) => {
          if (con[`@id`]) {
            // New connector was added
            this.$util.log(` ---> new connector of type ${con.type} added`);

            if (con.type == "Link") {
              // if new connector "link" has been added then
              // we create new link between components
              let [srcSubcomp, srcEp] = con.inputs[0].split(
                common.MAPPING_SEPARATOR
              );
              let [dstSubcomp, dstEp] = con.outputs[0].split(
                common.MAPPING_SEPARATOR
              );
              let cell = new LinkViewModel({
                id: con[`@id`],
                source: {
                  id: srcSubcomp,
                  port: srcEp,
                },
                target: {
                  id: dstSubcomp,
                  port: dstEp,
                },
              });
              if (con[`@layout`]) {
                //let conLayout = JSON.parse(con[`@layout`]);
                let conLayout = con[`@layout`];
                // - matching layout found
                // [TODO] layout format for links ?????
              }
              this.graph.addCell(cell);
            } else {
              // otherwise, it is a component-based connector,
              // we create a connector cell
              let conType = common.findComponentByRoute(
                this.components,
                common.route(this.currentRoute, con[`@id`])
              );

              let cell = new ConnectorViewModel({
                id: con[`@id`],
                name: con[`@name`],
                mode: this.mode,
                component: conType[`@id`],
                variables: conType.variables,
                endpoints: conType.endpoints,
                volumes: conType.volumes,
              });

              if (con[`@layout`]) {
                //let conLayout = JSON.parse(con[`@layout`]);
                let conLayout = con[`@layout`];
                // - matching layout found
                if (conLayout.position)
                  cell.set("position", conLayout.position);
                if (conLayout.size) cell.set("size", conLayout.size);
              }

              // register new watch on component type
              if (
                !_.find(
                  this.destroyers,
                  (destroyer) => destroyer.id == conType[`@id`]
                )
              ) {
                this.destroyers.push({
                  id: conType[`@id`],
                  fn: this.$watch(
                    () => conType,
                    (newVal, oldVal) => {
                      this.onModelChange(conType[`@id`], newVal, oldVal);
                    },
                    { deep: true }
                  ),
                });
              }

              this.graph.addCell(cell);
            }
          } else if (con[`@name`]) {
            this.$util.log("connector name changed");
            let cell = this.graph.getCell(conId);
            cell.set("name", con[`@name`]);
            cell.refresh();
          } else if (con["@color"]) {
            this.$util.log("connector color changed");
            let cell = this.graph.getCell(conId);
            cell.set("color", con[`@color`]);
            cell.refresh();
            // little hack: don't know why body color does not refresh
            let view = this.paper.findViewByModel(cell);
            view.render();
            // - trigger layout change
            this.$emit("change", { type: "layout", value: this.getLayout() });
          } 
          // - if inputs then add links
          if (con.type != "Link" && con.inputs && con.inputs.length) {
            _.each(con.inputs, (input) => {
              this.$util.log(` ---> new input link to connector ${conId}`);
              let [srcSubcomp, srcEp] = input.split(common.MAPPING_SEPARATOR);
              let cell = new LinkViewModel({
                id: input + "->" + conId,
                source: {
                  id: srcSubcomp,
                  port: srcEp,
                },
                target: {
                  id: conId,
                },
              });
              this.graph.addCell(cell);
            });
          }
          // - if outputs then add links
          if (con.type != "Link" && con.outputs && con.outputs.length) {
            _.each(con.outputs, (output) => {
              this.$util.log(` ---> new output link to connector ${conId}`);
              let [dstSubcomp, dstEp] = output.split(common.MAPPING_SEPARATOR);
              let cell = new LinkViewModel({
                id: conId + "->" + output,
                source: {
                  id: conId,
                },
                target: {
                  id: dstSubcomp,
                  port: dstEp,
                },
              });
              this.graph.addCell(cell);
            });
          }
        });

        // 4. Detect connector removals
        _.each(diffInverse.connectors, (con, conId) => {
          if (con[`@id`]) {
            this.$util.log(` ---> connector removed`);
            let cell = this.graph.getCell(con[`@id`]);
            this.graph.removeCells(cell);

            if (con.type != "Link") {
              // if component-based connector
              // unregister watch on component type
              if (
                !_.find(
                  this.graph.getCells(),
                  (_cell) => _cell.component == cell.component
                )
              ) {
                let index = this.destroyers.findIndex(
                  (destroyer) => (destroyer.id = cell.component)
                );
                if (index != -1) {
                  this.destroyers[index].fn();
                  this.destroyers.splice(index, 1);
                }
              }
            }
          } else if (con.inputs && con.inputs.length) {
            this.$util.log(` ---> delete input link to connector ${conId}`);
            // the input link has been removed
            let uuid = con.inputs[0] + "->" + conId;
            let cell = this.graph.getCell(uuid);
            if (cell) this.$util.log(` ---> cell to remove detected`);
            else this.$util.log(` ---> cell to remove not detected`);
            this.graph.removeCells(cell);
          } else if (con.outputs && con.outputs.length) {
            this.$util.log(` ---> delete output link from connector ${conId}`);
            // the output link has been removed
            let uuid = conId + "->" + con.outputs[0];
            let cell = this.graph.getCell(uuid);
            if (cell) this.$util.log(` ---> cell to remove detected`);
            else this.$util.log(` ---> cell to remove not detected`);
            this.graph.removeCells(cell);
          }
        });
      } else  {
        // [TODO] Detect minor changes which affect display
        //    - look for subcomponents of the affected type
        //      and refresh
        this.$util.log("change detected in subcomponent");
        let subcompType = common.findComponentByPath(this.components, id);        
        _.each(this.graph.getCells(), (cell) => {
          if (cell.get("component") == id) {
            this.$util.log(`refreshing subcomponent ${cell.id} ...`);
            cell.set({
              //name: subcompType[`@name`],
              variables: subcompType.variables,
              endpoints: subcompType.endpoints,
              volumes: subcompType.volumes,
            });
            cell.refresh();
          }
        });
      }

      //this.doLayout();
    },

    /**
     * Handler called when the currently selected action changes.
     */
    onAction() {
      this.$util.log(
        `[CompositeInternals] onAction(${JSON.stringify(
          this.action
        )},${JSON.stringify(this.action)})`
      );

      // - [TODO] detect changes ??
      if (!this.action) return;

      if (this.action.name != this.currentActionName) {
        // - clean up previous action
        if (this.currentActionName && this[`${this.currentActionName}Destroy`])
          this[`${this.currentActionName}Destroy`]();

        // - destroy action context (only if action changes)
        _.each(this.actionContext, (val, key) => {
          this.$delete(this.actionContext, key);
        });
      }

      this.currentActionName = this.action.name;

      // - initialize new action
      if (this[`${this.action.name}Init`]) this[`${this.action.name}Init`]();
    },

    /**
     * Load diagram taking this.componentRoute
     *
     * @param {Object} [opts] - Additional options
     * @param {boolean} opts.nosave - No save previous
     */
    load(opts) {
      this.$util.log(
        `[CompositeInternals] load(${JSON.stringify(
          this.componentRoute
        )},${JSON.stringify(opts)})`
      );

      /*opts = opts || { nosave: false };

      // - save previous state
      if (!opts.nosave) this.save();*/

      // - if previously loaded then unload
      if (this.loaded) this.unload();

      // - set current route
      this.currentRoute = this.componentRoute;

      // - make a copy of current component
      this.cachedComponent = _.cloneDeep(this.component);

      // - add watch to this component and subcomponents

      this.destroyers = [];
      this.destroyers.push({
        id: this.component[`@id`],
        fn: this.$watch(
          () => this.component,
          (newVal, oldVal) => {
            this.onModelChange(this.component[`@id`], newVal, oldVal);
          },
          { deep: true }
        ),
      });
      _.forEach(this.component.subcomponents, (subcomp, subcompId) => {
        let subcompType = common.findComponentByRoute(
          this.components,
          common.route(this.currentRoute, subcomp[`@id`])
        );
        this.destroyers.push({
          id: subcompType[`@id`],
          fn: this.$watch(
            () => subcompType,
            (newVal, oldVal) => {
              this.onModelChange(subcompType[`@id`], newVal, oldVal);
            },
            { deep: true }
          ),
        });
      });

      // - set paper properties
      /* this.paper.drawBackground({
        color: this.currentPath == "" ? "white" : "lightgray",
      });*/

      this.paper.setInteractivity(this.mode != "read");
      //this.paper.setInteractivity(false);

      // - do layout
      this.doLayout();

      // - do display
      /*let display = this.display[this.currentPath] || {
        fit: true,
        center: true,
      };*/
      let display;
      // if root component then center
      if (!this.currentRoute) {
        display = {
          scale: 2,
          container: {
            width: this.$refs.container.offsetWidth,
            height: this.$refs.container.offsetHeight,
          },
          margin: {
            left: 0.1,
            right: 0.1,
            top: 0.1,
            bottom: 0.1,
          },
          fullscreen: true,
        };
      } else {
        display = {
          fit: true,
          center: true,
        };
      }
      this.doDisplay(display);
      this.loaded = true;
    },

    /**
     * Cleans previous loaded state
     */
    unload() {
      this.$util.log(`[CompositeInternals] unload()`);

      if (!this.loaded) return;

      // - clean previous state
      this.graph.clear();
      if (this.destroyers && this.destroyers.length) {
        this.destroyers.forEach((destroyer) => destroyer.fn());
      }

      this.loaded = false;
    },

    /**
     * Save current layout and display.
     *
     */
    save() {
      this.$util.log(`[CompositeInternals] save()`);
    },

    /**
     * Paint components in paper and does layout.
     */
    doLayout() {
      this.$util.log(`[CompositeInternals] doLayout()`);

      let currentPath = common.route2Path(this.components, this.currentRoute);

      let layout =
        this.componentsLayout &&
        this.componentsLayout[currentPath];
      //JSON.parse(this.componentsLayout[currentPath]);

      let doLayout = true;

      // - clean
      this.graph.clear();

      // 1. Add subcomponents
      //
      let cells = [];
      _.each(this.component.subcomponents, (subcomp, subcompId) => {
        let subcompType = common.findComponentByRoute(
          this.components,
          common.route(this.currentRoute, subcomp[`@id`])
        );
        let cell;
        if (subcompType.type === "basic") {
          cell = new BasicViewModel({
            id: subcomp[`@id`],
            name: subcomp[`@name`],
            mode: (subcompType[`@origin`] && "read") ||
                  (subcompType[`@opaque`] && "locked") ||
                  "write",
            color: subcomp[`@color`] || subcompType[`@color`],
            component: subcompType[`@id`],
            variables: subcompType.variables,
            endpoints: subcompType.endpoints,
            volumes: subcompType.volumes,
          });
        } else if (subcompType.type === "composite") {
          cell = new CompositeViewModel({
            id: subcomp[`@id`],
            name: subcomp[`@name`],
            mode: (subcompType[`@origin`] && "read") ||
                  (subcompType[`@opaque`] && "locked") ||
                  "write",
            color: subcomp[`@color`] || subcompType[`@color`],
            component: subcompType[`@id`],
            variables: subcompType.variables,
            endpoints: subcompType.endpoints,
            volumes: subcompType.volumes,
          });
        }

        // - check existent layout (first global, then inline - required for new additions)
        let subcompLayout;
        if (layout) {
          subcompLayout = _.find(
            layout.subcomponents,
            (val, key) => val.id == subcomp[`@id`]
            //(val, key) => val.name == subcomp[`@name`]
          );
        }
        if (!subcompLayout && subcomp[`@layout`]) {
          //subcompLayout = JSON.parse(subcomp[`@layout`]);
          subcompLayout = subcomp[`@layout`];
        }
        if (subcompLayout) {
          doLayout = false;
          // - matching layout found
          if (subcompLayout.position)
            cell.set("position", subcompLayout.position);
          if (subcompLayout.size) cell.set("size", subcompLayout.size);
          if (subcompLayout.color) cell.set("color", subcompLayout.color);
          if (subcompLayout.endpoints) {
            _.each(subcompLayout.endpoints, (ep) => {
              cell.updatePort({
                id: ep.id,
                position: ep.position,
              });
            });
          }
          cell.refresh();
        }
        cells.push(cell);
      });

      // 2. Add connectors
      //
      _.each(this.component.connectors, (con, conId) => {
        if (con.type == "Link") {
          // - if link connector then add link between peers
          let [srcSubcomp, srcEp] = con.inputs[0].split(
            common.MAPPING_SEPARATOR
          );
          let [dstSubcomp, dstEp] = con.outputs[0].split(
            common.MAPPING_SEPARATOR
          );
          let cell = new LinkViewModel({
            id: con[`@id`],
            source: {
              id: srcSubcomp,
              port: srcEp,
            },
            target: {
              id: dstSubcomp,
              port: dstEp,
            },
          });
          let conLayout;
          if (layout) {
            conLayout = _.find(
              layout.links,
              (val, key) => val.id == con[`@id`]
            );
          }
          if (!conLayout && con[`@layout`]) {
            //conLayout = JSON.parse(con[`@layout`]);
            conLayout = con[`@layout`];
          }
          if (conLayout) {
            doLayout = false;
            // - matching layout found
            // [TODO] layout format for links ?????
          }
          cells.push(cell);
        } else {
          let conType = common.findComponentByRoute(
            this.components,
            common.route(this.currentRoute, con[`@id`])
          );

          let cell = new ConnectorViewModel({
            id: con[`@id`],
            name: con[`@name`],
            mode: this.mode,
            color: con[`@color`] || conType[`@color`],
            published: _.find(this.component.endpoints, (ep) => ep.mapping == con[`@id`])? true: false,
            component: conType[`@id`],
            variables: conType.variables,
            endpoints: conType.endpoints,
            volumes: conType.volumes,
          });
          // - check existent layout (first global, then inline - required for new additions)
          let conLayout;
          if (layout) {
            conLayout = _.find(
              layout.connectors,
              (val, key) => val.id == con[`@id`]
              //(val, key) => val.name == subcomp[`@name`]
            );
          }
          if (!conLayout && con[`@layout`]) {
            //conLayout = JSON.parse(con[`@layout`]);
            conLayout = con[`@layout`];
          }
          if (conLayout) {
            doLayout = false;
            // - matching layout found
            if (conLayout.position) cell.set("position", conLayout.position);
            if (conLayout.size) cell.set("size", conLayout.size);
            if (conLayout.color) cell.set("color", conLayout.color);
            cell.refresh();
          }
          cells.push(cell);

          // - add links for input/outputs
          _.each(con.inputs, (input) => {
            let [srcSubcom, srcEp] = input.split(common.MAPPING_SEPARATOR);
            let uuid = input + "->" + con[`@id`];
            cell = new LinkViewModel({
              id: uuid,
              source: {
                id: srcSubcom,
                port: srcEp,
              },
              target: {
                id: con[`@id`],
              },
            });
            if (conLayout) {
              doLayout = false;
              // [TODO] layout format for links ???
            }
            cells.push(cell);
          });
          _.each(con.outputs, (output) => {
            let [dstSubcom, dstEp] = output.split(common.MAPPING_SEPARATOR);
            let uuid = con[`@id`] + "->" + output;
            cell = new LinkViewModel({
              id: uuid,
              source: {
                id: con[`@id`],
              },
              target: {
                id: dstSubcom,
                port: dstEp,
              },
            });
            if (conLayout) {
              doLayout = false;
              // [TODO] layout format for links ???
            }
            cells.push(cell);
          });
        }
      });

      this.graph.addCells(cells);

      if (doLayout) {
        // - do default layouttype: cell.get("type"),
        this.$util.log(" - applying default layout ...");
        joint.layout.DirectedGraph.layout(
          this.graph /*{setLinkVertices: false}*/,
          { nodeSep: 150, dagre: dagre, graphlib: graphlib }
        );
      }

      // - trigger layout change
      //this.$emit("change", { type: "layout", value: this.getLayout() });

      // - select cell (if any)
      //this.onSelect();
    },

    /**
     * Returns the current component layout.
     *
     * @return {string} - The component layout
     */
    getLayout() {
      this.$util.log("[CompositeInternals] getLayout()");

      let layout = { subcomponents: [], connectors: [], links: [] };
      this.graph.getCells().forEach((cell) => {
        switch (cell.get("type")) {
          //case "komponents.Basic":
          //case "komponents.Composite":
          case "basic":
          case "composite":
            var subcomp = {
              id: cell.get("id"),
              type: cell.get("type"),
              name: cell.get("name"),
              component: cell.get("component"),
              position: cell.get("position"),
              size: cell.get("size"),
              color: cell.get("color") || common.COLOR_BACKGROUND,
              endpoints: _.map(cell.getPorts(), (port) => {
                return {
                  id: port.id,
                  name: port.name,
                  type: port.type,
                  position: cell.getPort(port.id).position,
                };
              }),
            };
            layout.subcomponents.push(subcomp);
            break;
          //case "komponents.Connector":
          case "connector":
            var connector = {
              id: cell.id,
              type: cell.get("type"),
              name: cell.get("name"),
              published: cell.get("published"),
              position: cell.get("position"),
              size: cell.get("size"),
              color: cell.get("color") || common.COLOR_BACKGROUND,
            };
            layout.connectors.push(connector);
            break;
          //case "komponents.Link":
          case "link":
            var link = {
              id: cell.id,
              type: cell.get("type"),
              source: cell.get("source"),
              target: cell.get("target"),
            };
            layout.links.push(link);
            break;
          default:
        }
      });
      return layout;
      //return JSON.stringify(layout);
    },

    /**
     * Normalizes the display.
     *
     * @param {Object} [opts] - Additional options
     * @param {boolean} [opts.fit] - Fit model
     * @param {boolean} [opts.center] - Centers display
     * @param {Object} [opts.container] - Container size
     * @param {Object} [opts.canvas] - Canvas size (.width, .height)
     * @param {Object} [opts.margin] - Margin
     * @param {number} [opts.scale] - Scale
     * @param {Object} [opts.translate] - Translate (.tx, .ty)
     * @param {Object} [opts.offset] - Offset (.left, .top)
     * @param {boolean} [opts.fullscreen] - Maximize
     */
    doDisplay(opts) {
      this.$util.log(`[CompositeInternals] doDisplay(${JSON.stringify(opts)})`);

      opts = opts || {};

      let bbox = this.graph.getBBox();
      bbox = bbox || { x: 0, y: 0, width: 0, height: 0 };
      let container = opts.container || {
        width: this.$refs.container.offsetWidth,
        height: this.$refs.container.offsetHeight,
      };
      this.$util.log(
        `bbox: ${JSON.stringify(bbox)}, container: ${JSON.stringify(container)}`
      );

      // - calculate margin
      let margin = _.isString(opts.margin) ? Number(opts.margin) : opts.margin;
      margin = _.isNumber(margin)
        ? { left: margin, right: margin, top: margin, bottom: margin }
        : margin;
      margin = margin || {};
      ["left", "right", "top", "bottom"].forEach((side) => {
        margin[side] = margin[side] || 20;
      });
      ["left", "right"].forEach((side) => {
        margin[side] =
          margin[side] > 0 && margin[side] < 1
            ? margin[side] * container.width
            : margin[side];
      });
      ["top", "bottom"].forEach((side) => {
        margin[side] =
          margin[side] > 0 && margin[side] < 1
            ? margin[side] * container.height
            : margin[side];
      });
      //let margin = { left: 0, right: 0, top: 0, bottom: 0 };

      // - calculate scale
      let ratioX = (container.width - margin.left - margin.right) / bbox.width;
      let ratioY =
        (container.height - margin.top - margin.bottom) / bbox.height;
      let scale = ratioX < ratioY ? ratioX : ratioY;

      this.$util.log(`ratio: (${ratioX}, ${ratioY}}, scale: ${scale}`);

      if (opts.fullscreen) {
        this.paper.setDimensions(container.width, container.height);

        this.paper.translate(
          (container.width - margin.left - margin.right) / 2 +
            margin.left -
            bbox.width / 2,
          (container.height - margin.top - margin.bottom) / 2 +
            margin.top -
            bbox.height / 2
        );

        if (opts.scale) scale = opts.scale > scale ? scale : opts.scale;
        this.paper.scale(scale, scale, bbox.width / 2, bbox.height / 2);
      } else {
        // - calculate scale
        if (opts.scale) {
          scale = opts.scale;
        } else if (opts.fit) {
          scale = scale > 1 ? 1 : scale;
        } else {
          scale = this.paper.scale().sx;
        }

        // - get reference point (left-top corner)
        let ref = this.paper.paperToLocalPoint({
          x: this.$refs.container.scrollLeft,
          y: this.$refs.container.scrollTop,
        });

        // - paper dimensions
        let factorX = bbox.width * scale;
        factorX = factorX > container.width ? factorX : container.width;
        let factorY = bbox.height * scale;
        factorY = factorY > container.height ? factorY : container.height;
        let canvas = opts.canvas
          ? opts.canvas
          : {
              width: factorX + container.width * 2,
              height: factorY + container.height * 2,
            };
        /*let canvas = opts.canvas
          ? opts.canvas
          : {
              width: factorX,
              height: factorY,
            };*/
        this.$util.log(
          `ref: ${JSON.stringify(
            ref
          )}, factor: ${factorX},${factorY}, scale: ${JSON.stringify(
            scale
          )}, canvas: ${JSON.stringify(canvas)}`
        );

        this.paper.setDimensions(canvas.width, canvas.height);

        // - translate origin
        let translate = opts.translate
          ? {
              x: opts.translate.tx,
              y: opts.translate.ty,
            }
          : {
              x: canvas.width / 2 - (bbox.x + bbox.width / 2) * scale,
              y: canvas.height / 2 - (bbox.y + bbox.height / 2) * scale,
            };
        this.paper.translate(translate.x, translate.y);

        // - move scroll
        if (!opts.center) {
          if (opts.scroll) {
            this.$refs.container.scrollLeft = opts.scroll.left;
            this.$refs.container.scrollTop = opts.scroll.top;
          } else {
            ref = this.paper.localToPaperPoint(ref);
            this.$refs.container.scrollLeft = ref.x;
            this.$refs.container.scrollTop = ref.y;
          }
        } else {
          this.$refs.container.scrollLeft =
            canvas.width / 2 - container.width / 2;
          this.$refs.container.scrollTop =
            canvas.height / 2 - container.height / 2;
        }

        this.paper.scale(scale, scale);
      }
    },

    /**
     * Saves the current component display.
     */
    saveDisplay() {
      this.$util.log("[CompositeInternals] saveDisplay()");
      /*var self = this;

      self.component.set("display", {
        size: {
          width: self.paper.options.width,
          height: self.paper.options.height,
        },
        scroll: {
          left: self.gui.container.scrollLeft(),
          top: self.gui.container.scrollTop(),
        },
        scale: self.paper.scale().sx,
        translate: self.paper.translate(),
      });*/
    },

    /**
     * Handler called when mouse/pointer events are triggered.
     */
    mouseEvent(type, ev) {
      /*let pt = this.paper.pageToLocalPoint(ev.pageX, ev.pageY);
      this.$util.log(`[CompositeInternals] mouseEvent(${type},${pt.x},${pt.y})`);*/

      // - check actions
      let methodName = `${this.action.name}${type
        .charAt(0)
        .toUpperCase()}${type.slice(1)}`;
      this[methodName] && this[methodName](ev);

      // - later check interceptors
      methodName = `mouse${type.charAt(0).toUpperCase()}${type.slice(1)}`;
      this[methodName] && this[methodName](ev);
    },

    mouseDown(ev) {
      // In mobile devices click/dblclick events do not
      // trigger. With this code we enable these events
      this.pointerTime = Date.now();
      this.pointerTarget = this.actionContext.overCell;
      /*this.$util.log(
        `mouseDown ${this.pointerTarget ? this.pointerTarget.id : ""}`
      );*/
    },

    mouseUp(ev) {
      // In mobile devices click/dblclick events do not
      // trigger. With this code we enable these events
      //this.$util.log(`mouseUp ${this.pointerTarget ? this.pointerTarget.id : ""}  - ${this.actionContext.selectedCell? this.actionContext.selectedCell.id: ''}- ${Date.now() - this.pointerTime }`);
      if (
        this.pointerTime &&
        this.pointerTarget == this.actionContext.selectedCell
      ) {
        if (Date.now() - this.pointerTime < 200) {
          // - click detected
          let methodName = `${this.action.name}Click`;
          this[methodName] && this[methodName](ev);

          methodName = `mouseClick`;
          this[methodName] && this[methodName](ev);
          this.clickTime = Date.now();
          this.clickTarget = this.pointerTarget;
        }
      }
    },

    mouseClick(ev) {
      // In mobile devices click/dblclick events do not
      // trigger. With this code we enable these events
      if (
        this
          .clickTime /*&&
        this.clickTarget == this.actionContext.selectedCell*/
      ) {
        if (Date.now() - this.clickTime < 400) {
          // - dblclick detected
          let methodName = `${this.action.name}DblClick`;
          this[methodName] && this[methodName](ev);

          methodName = `mouseDblClick`;
          this[methodName] && this[methodName](ev);
        }
      }
    },

    /************* Pointer actions ************/

    /**
     * This handler is called whenever the selected action changed
     * but also when the current selected component changes.
     */
    pointerInit() {
      this.$util.log(
        `[CompositeInternals] pointerInit(${this.action.selectedId})`
      );

      // - set cursor to default
      this.cursor = "default";

      this.paper.setInteractivity(this.mode == "write");

      if (this.action.selectedId) {
        // - A subcomponent/connector must be selected
        if (
          this.actionContext.selectedCell &&
          this.actionContext.selectedCell.id != this.action.selectedId
        ) {
          // - if current selection is different then deselect
          this.actionContext.selectedCell.highlight &&
            this.actionContext.selectedCell.highlight(
              { type: "select" },
              false
            );
          this.$delete(this.actionContext, "selectedCell");
        }
        // - select new subcomponent/connector
        let cell = this.graph.getCell(this.action.selectedId);
        this.$set(this.actionContext, "selectedCell", cell);
        this.actionContext.selectedCell.highlight &&
          this.actionContext.selectedCell.highlight({ type: "select" }, true);

        // - show menu
        this.doMenu();
      } else {
        // No selection
        // - do nothing: if we clean currently selectedCell
        //   then link selections get lost, because the parent
        //   does not keep track of link selections
        /*if (this.actionContext.selectedCell) {
          // - if there is a current selection then deselect
          this.actionContext.selectedCell.highlight &&
            this.actionContext.selectedCell.highlight(
              { type: "select" },
              false
            );
          this.$delete(this.actionContext, "selectedCell");
        }*/
      }
    },
    pointerDestroy() {
      this.$util.log(`[CompositeInternals] pointerDestroy()`);
      this.paper.setInteractivity(false);
      if (this.actionContext.selectedCell) {
        // if selected then unselect
        this.actionContext.selectedCell.highlight &&
          this.actionContext.selectedCell.highlight({ type: "select" }, false);
        // unselect
        this.$delete(this.actionContext, "selectedCell");
      }
    },

    pointerMove(ev) {
      var pt = this.paper.pageToLocalPoint({ x: ev.pageX, y: ev.pageY });
      var cells = this.graph.findModelsFromPoint(pt);
      var cell = (cells.length && cells[0]) || null;

      if (this.actionContext.overCell && cell !== this.actionContext.overCell) {
        // cell leave!!!
        // - clean previous state

        // - unhighlight previous cell
        this.actionContext.overCell.highlight &&
          this.actionContext.overCell.highlight({ type: "light" }, false);
        // - unhighlight previous port
        this.actionContext.overPort &&
          this.actionContext.overCell.highlightPort &&
          this.actionContext.overCell.highlightPort(
            this.actionContext.overPort.id,
            { type: "light" },
            false
          );
        // - unhighlight previous icon
        this.actionContext.overIcon &&
          this.actionContext.overCell.highlightIcon &&
          this.actionContext.overCell.highlightIcon(
            this.actionContext.overIcon.id,
            { type: "light" },
            false
          );
        // - remove tracking data
        this.$delete(this.actionContext, "overCell");
        this.$delete(this.actionContext, "overPort");
        this.$delete(this.actionContext, "overIcon");
      }

      if (cell) {
        // over cell ...
        //
        //this.$util.log(`overCell!!`);
        this.$set(this.actionContext, "overCell", cell);

        // - hightlight cell
        cell.highlight && cell.highlight({ type: "light" }, true);

        // - manage port highlighting
        let port = cell.findPortFromPoint && cell.findPortFromPoint(pt);
        if (
          this.actionContext.overPort &&
          this.actionContext.overPort !== port
        ) {
          // - no longer over the previous port
          this.actionContext.overCell &&
            this.actionContext.overCell.highlightPort(
              this.actionContext.overPort.id,
              { type: "light" },
              false
            );
          this.$delete(this.actionContext, "overPort");
        }
        if (port) {
          // - over port: highlight
          cell.highlightPort &&
            cell.highlightPort(port.id, { type: "light" }, true);
          this.$set(this.actionContext, "overPort", port);
        }

        // - manage icon highlighting
        var icon = cell.findIconFromPoint && cell.findIconFromPoint(pt);
        if (
          this.actionContext.overIcon &&
          this.actionContext.overIcon !== icon
        ) {
          // - no longer over the previous icon
          this.actionContext.overCell &&
            this.actionContext.overCell.highlightIcon(
              this.actionContext.overIcon.id,
              { type: "light" },
              false
            );
          this.$delete(this.actionContext, "overIcon");
        }
        if (icon) {
          // - highlight icon
          cell.highlightIcon &&
            cell.highlightIcon(icon.id, { type: "light" }, true);
          this.$set(this.actionContext, "overIcon", icon);
          this.$util.log("over icon! " + JSON.stringify(icon));
        }
      }
    },

    /**
     * Handler triggered when pointerdown. This handler notifies
     * the subcomponent/connector/link selection.
     */
    pointerDown(ev) {
      this.$util.log(`[CompositeInternals] pointerDown()`);

      // In mobile devices pointerMove is not triggered, so first we force
      // pointerMove() to set overCell/overPort/overIcon properties
      //this.pointerMove(ev);

      if (this.actionContext.overCell) {
        this.$util.log(
          `[CompositeInternals] pointerDown(${this.actionContext.overCell.id})`
        );

        // We are over a cell: we have to select it

        // - if the previous selection is different then unselect
        if (this.actionContext.selectedCell != this.actionContext.overCell) {
          this.actionContext.selectedCell &&
            this.actionContext.selectedCell.highlight &&
            this.actionContext.selectedCell.highlight(
              { type: "select" },
              false
            );
        }

        // - select new cell
        this.$set(
          this.actionContext,
          "selectedCell",
          this.actionContext.overCell
        );
        this.actionContext.selectedCell.highlight &&
          this.actionContext.selectedCell.highlight({ type: "select" }, true);

        this.doMenu();

        // Notify??
        // - we trigger event if the selected component is a
        //   subcomponent or connector and:
        //   (1) the selected component has changed or
        //   (2) a specific icon/endpoint has been clicked

        if (
          this.actionContext.overCell.get("type") == "link" &&
          this.action.selectedId != this.actionContext.overCell.id
        ) {
          if (
            this.actionContext.overCell.get("source").port &&
            this.actionContext.overCell.get("target").port
          ) {
            // - if connector then trigger selection
            setTimeout(() => {
              this.$emit("action", {
                type: "select",
                selectedId: this.actionContext.overCell.id,
                selectedType: "connector-link",
                //selectedType: "connector",
              });
            }, 0);
          } else {
            // - if dummy link then trigger selection
            setTimeout(() => {
              this.$emit("action", {
                type: "select",
                source: {
                  id: this.actionContext.overCell.get("source").id,
                  endpoint: this.actionContext.overCell.get("source").port,
                },
                target: {
                  id: this.actionContext.overCell.get("target").id,
                  endpoint: this.actionContext.overCell.get("target").port,
                },
                selectedType: "link",
              });
            }, 0);
          }
        } else {
          let event = {
            type: "select",
            selectedId: this.actionContext.overCell.id,
            selectedType: this.actionContext.overCell.get("type"),
          };
          if (this.actionContext.overPort)
            event.selectedPath = `endpoints/${this.actionContext.overPort.id}`;
          if (this.actionContext.overIcon)
            event.selectedPath = this.actionContext.overIcon.name;

          if (
            this.action.selectedId != this.actionContext.overCell.id ||
            event.selectedPath
          ) {
            setTimeout(() => {
              this.$emit("action", event);
            }, 0);
          }
        }
      } else {
        // No selected cell

        if (this.actionContext.selectedCell) {
          // - if previously selected cell, then deselect
          this.actionContext.selectedCell.highlight &&
            this.actionContext.selectedCell.highlight(
              { type: "select" },
              false
            );
          this.$delete(this.actionContext.selectedCell);
        }

        // - we trigger (only if we change the selection)
        if (this.action.selectedId != "")
          setTimeout(() => {
            this.$emit("action", { type: "select" });
          }, 0);
      }

      /*this.pointerMove(ev); // this enables pointer behaviour
      if (this.actionContext.overPort) {
        if (this.mode === "write") {
          var pt = this.actionContext.overCell.getPortPosition(
            this.actionContext.overPort.id
          );
          pt.x += this.actionContext.overCell.position().x;
          pt.y += this.actionContext.overCell.position().y;
          pt = this.paper.localToPaperPoint(pt);
          this.$set(this.actionContext, "dragging", {
            cell: this.actionContext.overCell,
            port: this.actionContext.overPort,
            //port: this.actionContext.overPort.id,
            pt: pt,
          });

          let triangleRotate;
          if (
            this.actionContext.dragging.port.type == "in" &&
            this.actionContext.dragging.port.position == "left"
          )
            triangleRotate = 90;
          else if (
            this.actionContext.dragging.port.type == "in" &&
            this.actionContext.dragging.port.position == "right"
          )
            triangleRotate = -90;
          else if (
            this.actionContext.dragging.port.type == "out" &&
            this.actionContext.dragging.port.position == "right"
          )
            triangleRotate = 90;
          else if (
            this.actionContext.dragging.port.type == "out" &&
            this.actionContext.dragging.port.position == "left"
          )
            triangleRotate = -90;

          this.actionContext.dragging.triangle = joint.V("polygon", {
            points: `${pt.x - 10},${pt.y + 10} ${pt.x},${pt.y - 10} ${
              pt.x + 10
            },${pt.y + 10}`,
            transform: `rotate(${triangleRotate},${pt.x},${pt.y})`,
            stroke: common.DESIGN_PORT_MOVING_COLOR,
            "stroke-width": 2,
            fill: "transparent",
          });
          joint
            .V(document.getElementsByTagName("svg")[0])
            .append(this.actionContext.dragging.triangle);
        }
        this.select(true, this.actionContext.overCell, {
          section: "endpoints",
          item: this.actionContext.overPort.id,
        });
        /// - show port on panel
        setTimeout(function () {
          self.triggerMethod("select", true, overCell, {
            section: "endpoints",
            item: overPort.id,
          });
        }, 0);*
      } else if (this.actionContext.overIcon) {
        // - show icon type on panel
        this.select(true, this.actionContext.overCell, {
          section: this.actionContext.overIcon.name,
        });
        /*setTimeout(function () {
          self.triggerMethod("select", true, overCell, {
            section: overIcon.name,
          });
        }, 0);*
      } else if (this.actionContext.overCell) {
        // cell clicked
        this.select(true, this.actionContext.overCell);
        /*self.triggerMethod("select", true, overCell);*
      } else if (this.actionContext.overLink) {
        // link clicked
        /*self.triggerMethod("select", true, overLink);*
      } else if (this.currentRoute.length) {
        // container clicked
        this.select(false);
        /*self.triggerMethod("select", true);*
      } else {
        // blank clicked
        this.select(false);
        /*self.triggerMethod("select", false);*
      }*/
    },

    pointerUp(ev) {
      this.$util.log(`[CompositeInternals] pointerUp()`);
    },
    pointerClick(ev) {
      this.$util.log(
        `[CompositeInternals] pointerClick(${
          this.actionContext.overCell && this.actionContext.overCell.id
        })`
      );
    },
    pointerDblClick(ev) {
      this.$util.log(
        `[CompositeInternals] pointerDblClick(${this.actionContext.overCell})`
      );
      if (this.actionContext.overCell || this.actionContext.selectedCell) {
        this.$emit("action", {
          type: "dblclick",
          selectedId: this.actionContext.overCell
            ? this.actionContext.overCell.id
            : this.actionContext.selectedCell.id,
          selectedType: this.actionContext.overCell
            ? this.actionContext.overCell.get("type")
            : this.actionContext.selectedCell.get("type"),
        });
      }
    },

    /************* Zoom actions ************/
    zoomInInit() {
      this.$util.log(`[CompositeInternals] zoomInInit()`);
      let scale = this.paper.scale().sx;
      scale = scale / 0.8;
      this.paper.scale(scale, scale);
      this.$emit("action", { type: "zoomIn" });
    },
    zoomOutInit() {
      this.$util.log(`[CompositeInternals] zoomOutInit()`);
      let scale = this.paper.scale().sx;
      scale = scale * 0.8;
      this.paper.scale(scale, scale);
      this.$emit("action", { type: "zoomOut" });
    },
    zoomFitInit() {
      this.$util.log(`[CompositeInternals] zoomFitInit()`);
      this.doDisplay({ fit: true, center: true });
      this.$emit("action", { type: "zoomFit" });
    },
    zoomPanInit() {
      this.$util.log(`[CompositeInternals] zoomPanInit()`);
      this.cursor = "grab";
      this.showOverlay = true;
    },
    zoomPanDestroy() {
      this.$util.log(`[CompositeInternals] zoomPanInit()`);
      this.cursor = "default";
      this.showOverlay = false;
    },
    zoomPanDown(evt) {
      this.$util.log(`[CompositeInternals] zoomPanDown()`);
      this.$set(this.actionContext, "panning", {
        x: evt.pageX,
        y: evt.pageY,
      });
    },
    zoomPanMove(evt) {
      this.$util.log(`[CompositeInternals] zoomPanMove()`);
      if (this.actionContext.panning) {
        var scroll = {
          x: this.$refs.container.scrollLeft,
          y: this.$refs.container.scrollTop,
        };
        this.$refs.container.scrollLeft =
          scroll.x - (evt.pageX - this.actionContext.panning.x);
        this.$refs.container.scrollTop =
          scroll.y - (evt.pageY - this.actionContext.panning.y);
        this.$set(this.actionContext, "panning", {
          x: evt.pageX,
          y: evt.pageY,
        });
      }
    },
    zoomPanUp() {
      this.$util.log(`[CompositeInternals] zoomPanUp()`);
      this.$delete(this.actionContext, "panning");
    },

    /************* Component actions ************/
    addComponentInit() {
      this.$util.log(`[CompositeInternals] addComponentInit()`);
      this.cursor = "default";
      this.showOverlay = true;
    },
    /**
     * Handler required for removing the overlay component shape when
     * out of focus.
     */
    addComponentLeave(evt) {
      this.$util.log(`[CompositeInternals] addComponentLeave()`);
      // - remove component
      this.$refs.component.style.display = "none";
    },
    addComponentMove(evt) {
      evt.stopPropagation();

      let rect = this.$refs.overlay.getBoundingClientRect();
      let pt = {
        x: evt.clientX - rect.left - common.DESIGN_COMPONENT_WIDTH / 2,
        y: evt.clientY - rect.top - common.DESIGN_COMPONENT_HEIGHT / 2,
      };
      this.$refs.component.style.left = pt.x + "px";
      this.$refs.component.style.top = pt.y + "px";
      this.$refs.component.style.display = "block";

      let height = this.paper.scale().sy * common.DESIGN_COMPONENT_HEIGHT;
      let width = this.paper.scale().sx * common.DESIGN_COMPONENT_WIDTH;
      this.$refs.component.style.height = height + "px";
      this.$refs.component.style.width = width + "px";
    },
    addComponentClick(evt) {
      this.$util.log(`[CompositeInternals] addComponentClick()`);

      // - get paper position
      let event = {
        type: this.action.name,
        layout: {
          position: this.paper.pageToLocalPoint(
            evt.pageX - common.DESIGN_COMPONENT_WIDTH / 2,
            evt.pageY - common.DESIGN_COMPONENT_HEIGHT / 2
          ),
        },
      };
      // - trigger action
      this.$emit("action", event);
    },
    addComponentDestroy() {
      this.$util.log(`[CompositeInternals] addComponentDestroy()`);
      this.cursor = "default";
      this.showOverlay = false;
    },
    addCompositeInit() {
      this.addComponentInit();
    },
    addCompositeLeave(evt) {
      this.addComponentLeave(evt);
    },
    addCompositeMove(evt) {
      this.addComponentMove(evt);
    },
    addCompositeClick(evt) {
      this.addComponentClick(evt);
    },
    addCompositeDestroy() {
      this.addComponentDestroy();
    },
    addRecursiveInit() {
      this.addComponentInit();
    },
    addRecursiveLeave(evt) {
      this.addComponentLeave(evt);
    },
    addRecursiveMove(evt) {
      this.addComponentMove(evt);
    },
    addRecursiveClick(evt) {
      this.addComponentClick(evt);
    },
    addRecursiveDestroy() {
      this.addComponentDestroy();
    },
    importComponentInit() {
      this.addComponentInit();
    },
    importComponentLeave(evt) {
      this.addComponentLeave(evt);
    },
    importComponentMove(evt) {
      this.addComponentMove(evt);
    },
    importComponentClick(evt) {
      this.addComponentClick(evt);
    },
    importComponentDestroy(evt) {
      this.addComponentDestroy();
    },
    addConnectorInit() {
      this.$util.log(`[CompositeInternals] addConnectorInit()`);
      /*this.actionContext.interactive = this.paper.options.interactive;
      this.paper.setInteractivity(false);*/
      this.cursor = "default";
      this.showOverlay = true;
    },

    /**
     * Handler required for removing the overlay connector shape when
     * out of focus.
     */
    addConnectorLeave(evt) {
      this.$util.log(`[CompositeInternals] addConnectorLeave()`);
      // - remove component
      this.$refs.connector.style.display = "none";
    },

    /**
     * Handler triggered when moving the cursor in "addConnector" action.
     * - If we are on top of a component we use link-like mode, enabling direct
     *   connections between component endpoints.
     * - Otherwise we use component-like mode, showing the connector
     *   overlay
     */
    addConnectorMove(evt) {
      // We enable pointer tracking to know whether we are on top
      // of a component
      this.addLinkMove(evt);

      let pt = this.paper.clientToLocalPoint({ x: evt.pageX, y: evt.pageY });
      let cells = this.graph.findModelsFromPoint(pt);

      if (this.actionContext.dragging || cells.length) {
        // If on top of cell pass to "link"-like mode
        this.$refs.connector.style.display = "none"; // hide connector overlay
      } else {
        // If on empty space then pass to "component"-like mode
        let rect = this.$refs.overlay.getBoundingClientRect();
        let pt = {
          x:
            evt.clientX -
            rect.left -
            (this.paper.scale().sx * common.DESIGN_CONNECTOR_WIDTH) / 2,
          y:
            evt.clientY -
            rect.top -
            (this.paper.scale().sy * common.DESIGN_CONNECTOR_HEIGHT) / 2,
        };
        this.$refs.connector.style.left = pt.x + "px";
        this.$refs.connector.style.top = pt.y + "px";
        this.$refs.connector.style.display = "block";

        let height = this.paper.scale().sy * common.DESIGN_CONNECTOR_HEIGHT;
        let width = this.paper.scale().sx * common.DESIGN_CONNECTOR_WIDTH;
        this.$refs.connector.style.height = height + "px";
        this.$refs.connector.style.width = width + "px";
      }
    },

    /**
     * Handler triggered when pointer down in "addConnector" action.
     * - If we are over a component pass to link mode
     * - Otherwise add connector
     */
    addConnectorDown(evt) {
      this.$util.log(`[CompositeInternals] addConnectorDown()`);
      if (this.actionContext.overCell) {
        // If over component then pass to link mode
        this.addLinkDown(evt);
      } else {
        // If clicking outside then add connector
        let event = {
          type: this.action.name,
          layout: {
            position: this.paper.pageToLocalPoint(
              evt.pageX - common.DESIGN_CONNECTOR_WIDTH / 2,
              evt.pageY - common.DESIGN_CONNECTOR_HEIGHT / 2
            ),
          },
        };
        // - trigger action
        this.$emit("action", event);
      }
    },

    /**
     * Handler triggered when pointer down in "addConnector" action.
     * - This only takes effect if in link mode
     */
    addConnectorUp(evt) {
      if (this.actionContext.dragging) this.addLinkUp(evt);
      else {
        // - trigger action
        this.$emit("action", {
          type: this.action.name,
          layout: {
            position: this.paper.pageToLocalPoint(
              evt.pageX - common.DESIGN_CONNECTOR_WIDTH / 2,
              evt.pageY - common.DESIGN_CONNECTOR_HEIGHT / 2
            ),
          },
        });
      }
    },

    /*addConnectorClick(evt) {
      // - get paper position
      let event = {
        type: this.action.name,
        layout: {
          position: this.paper.pageToLocalPoint(
            evt.pageX - common.DESIGN_CONNECTOR_WIDTH / 2,
            evt.pageY - common.DESIGN_CONNECTOR_HEIGHT / 2
          ),
        },
      };
      // - trigger action
      this.$emit("action", event);
    },*/

    addConnectorDestroy() {
      this.$util.log(`[CompositeInternals] addConnectorDestroy()`);
      this.cursor = "default";
      /*this.paper.setInteractivity(this.actionContext.interactive);
      delete this.actionContext.interactive;*/
      this.showOverlay = false;
    },

    addLinkInit() {
      this.$util.log(`[CompositeInternals] addLinkInit()`);
      //this.paper.setInteractivity(false);
      this.cursor = "pointer";
      this.showOverlay = true;
    },
    addLinkDown() {
      this.$util.log(`[CompositeInternals] addLinkDown()`);
      if (this.actionContext.overCell) {
        let pt;
        if (this.actionContext.overPort) {
          pt = this.actionContext.overCell.getPortPosition(
            this.actionContext.overPort.id
          );
          pt.x += this.actionContext.overCell.position().x;
          pt.y += this.actionContext.overCell.position().y;
        } else {
          //pt = self.paper.clientToLocalPoint({ x: evt.pageX, y: evt.pageY });
          pt = {
            x:
              this.actionContext.overCell.position().x +
              this.actionContext.overCell.size().width / 2,
            y:
              this.actionContext.overCell.position().y +
              this.actionContext.overCell.size().height / 2,
          };
        }

        this.$set(this.actionContext, "dragging", {
          cell: this.actionContext.overCell,
          port: this.actionContext.overPort,
          pt: this.paper.localToPaperPoint(pt),
        });
      }
    },

    addLinkMove(evt) {
      //this.$util.log(`[CompositeInternals] addLinkMove()`);
      // - detect cells
      let pt = this.paper.clientToLocalPoint({ x: evt.pageX, y: evt.pageY });
      let cells = this.graph.findModelsFromPoint(pt);
      if (cells.length) {
        // - over a cell
        this.$set(this.actionContext, "cell", cells[0]); // get only first cell
        if (
          ["basic", "composite"].includes(this.actionContext.cell.get("type"))
        ) {
          this.$util.log("over component!");
          // - we are over a component
          if (this.actionContext.dragging) {
            // - destinaton is a component
            // - check if connection is possible
            if (
              ["basic", "composite"].includes(
                this.actionContext.dragging.cell.get("type")
              )
            ) {
              // component -> component
              // - if source is a component then check source/destination
              //   endpoints compatibility
              let overPort = this.actionContext.cell.findPortFromPoint(
                pt,
                "in"
              );
              if (overPort) {
                // - check compatibility
                let src = {
                  subcomponent: this.actionContext.dragging.cell.id,
                  endpoint: this.actionContext.dragging.port.id,
                };
                let dst = {
                  subcomponent: this.actionContext.cell.id,
                  endpoint: overPort.id,
                };
                if (this.checkConnectionCompatibility(src, dst)) {
                  this.$set(this.actionContext, "port", overPort);
                }
              }
            } else if (
              this.actionContext.dragging.cell.get("type") === "connector"
            ) {
              // connector -> component
              // - if source is a connector then identify a source component
              //   and check endpoints compatibility
              let overPort = this.actionContext.cell.findPortFromPoint(
                pt,
                "in"
              );
              if (overPort) {
                // - check compatibility
                let src = this.actionContext.dragging.cell.id;
                let dst = {
                  subcomponent: this.actionContext.cell.id,
                  endpoint: overPort.id,
                };
                if (this.checkConnectionCompatibility(src, dst)) {
                  this.$set(this.actionContext, "port", overPort);
                }
              }
            }
          } else {
            // not dragging
            let overPort = this.actionContext.cell.findPortFromPoint(pt, "out");
            if (overPort) this.$set(this.actionContext, "port", overPort);
            else this.$delete(this.actionContext, "port");
          }
          if (!this.actionContext.port)
            this.$delete(this.actionContext, "cell");
        } else if (this.actionContext.cell.get("type") === "connector") {
          this.$util.log("over connector!");
          // - we are over a connector
          if (this.actionContext.dragging) {
            // - destination is a connector
            // - check if connection is possible
            let src,
              dst = this.actionContext.cell.id;
            if (this.actionContext.dragging.cell.get("type") === "connector") {
              // - source is connection too: connector -> connector
              src = this.actionContext.dragging.cell.id;
            } else if (
              ["basic", "composite"].includes(
                this.actionContext.dragging.cell.get("type")
              )
            ) {
              src = {
                subcomponent: this.actionContext.dragging.cell.id,
                endpoint: this.actionContext.dragging.port.id,
              };
            }
            if (!this.checkConnectionCompatibility(src, dst))
              this.$delete(this.actionContext, "cell");
          }
        } else {
          this.$delete(this.actionContext, "cell");
        }
      }

      // - detect repeated links
      /*if (this.actionContext.dragging && this.actionContext.cell) {
        let links = this.graph.getLinks();
        if (
          _.find(links, (link) => {
            let source = link.get("source");
            let target = link.get("target");
            return (
              source.id === this.actionContext.dragging.cell.id &&
              source.port ===
                (this.actionContext.dragging.port &&
                  this.actionContext.dragging.port.id) &&
              target.id === this.actionContext.cell.id &&
              target.port ===
                (this.actionContext.cell.port &&
                  this.actionContext.cell.port.id)
            );
          })
        ) {
          this.$delete(this.actionContext, "cell");
        }
      }*/

      // - (un)highlight
      if (
        this.actionContext.dragging &&
        this.actionContext.dragging.cell === this.actionContext.overCell
      ) {
        // do nothing (source cell remains highlighted)
      } else if (
        this.actionContext.port &&
        this.actionContext.overPort &&
        this.actionContext.port !== this.actionContext.overPort
      ) {
        this.actionContext.overCell.highlightPort(
          this.actionContext.overPort.id,
          { type: "light" },
          false
        );
        this.actionContext.cell.highlightPort(
          this.actionContext.port.id,
          { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
          true
        );
      } else if (this.actionContext.port && !this.actionContext.overPort) {
        this.actionContext.overCell &&
          this.actionContext.overCell.highlight({ type: "light" }, false);
        this.actionContext.cell.highlightPort(
          this.actionContext.port.id,
          { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
          true
        );
      } else if (!this.actionContext.port && this.actionContext.overPort) {
        this.actionContext.overCell.highlightPort(
          this.actionContext.overPort.id,
          { type: "light" },
          false
        );
        this.actionContext.cell &&
          this.actionContext.cell.highlight(
            { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
            true
          );
      } else if (!this.actionContext.port) {
        this.actionContext.overCell &&
          this.actionContext.overCell.highlight({ type: "light" }, false);
        this.actionContext.cell &&
          this.actionContext.cell.highlight(
            { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
            true
          );
      }
      this.$set(this.actionContext, "overCell", this.actionContext.cell);
      this.$set(this.actionContext, "overPort", this.actionContext.port);
      this.$delete(this.actionContext, "cell");
      this.$delete(this.actionContext, "port");

      if (this.actionContext.dragging) {
        let paperPt = this.paper.localToPaperPoint(pt);

        this.actionContext.dragging.arrow &&
          this.actionContext.dragging.arrow.remove();
        delete this.actionContext.dragging.arrow;

        let srcPt, dstPt;

        // - calculate arrow source
        if (
          this.actionContext.dragging.port &&
          this.actionContext.dragging.pt.distance(paperPt) >
            common.DESIGN_PORT_RADIUS
        ) {
          // - source is port:
          // - calculate arrow source from source port perimeter
          srcPt = joint.g
            .ellipse(
              this.actionContext.dragging.pt,
              common.DESIGN_PORT_RADIUS,
              common.DESIGN_PORT_RADIUS
            )
            .intersectionWithLineFromCenterToPoint(paperPt);
        } else if (
          !this.actionContext.dragging.port &&
          this.actionContext.dragging.pt.distance(paperPt) >
            this.actionContext.dragging.cell.size().width / 2
        ) {
          // - source is connector:
          // - calculate arrow source from source cell perimeter
          srcPt = joint.g
            .ellipse(
              this.actionContext.dragging.pt,
              this.actionContext.dragging.cell.size().width / 2,
              this.actionContext.dragging.cell.size().width / 2
            )
            .intersectionWithLineFromCenterToPoint(paperPt);
        }

        // - calculate arrow destination
        dstPt = paperPt;
        if (
          this.actionContext.overPort &&
          this.actionContext.dragging.port !== this.actionContext.overPort
        ) {
          // - destination is port:
          // - calculate arrow destination from destination port perimeter
          let centerPt = this.actionContext.overCell.getPortPosition(
            this.actionContext.overPort.id
          );
          centerPt.x += this.actionContext.overCell.position().x;
          centerPt.y += this.actionContext.overCell.position().y;
          centerPt = this.paper.localToPaperPoint(centerPt);
          dstPt = joint.g
            .ellipse(
              centerPt,
              common.DESIGN_PORT_RADIUS,
              common.DESIGN_PORT_RADIUS
            )
            .intersectionWithLineFromCenterToPoint(
              this.actionContext.dragging.pt
            );
        } else if (
          !this.actionContext.overPort &&
          this.actionContext.overCell
        ) {
          // - destination is connector:
          // - calculate arrow destination from destination cell perimeter
          let centerPt = {
            x:
              this.actionContext.overCell.position().x +
              this.actionContext.overCell.size().width / 2,
            y:
              this.actionContext.overCell.position().y +
              this.actionContext.overCell.size().height / 2,
          };
          dstPt = joint.g
            .ellipse(
              this.paper.localToPaperPoint(centerPt),
              this.actionContext.overCell.size().width / 2,
              this.actionContext.overCell.size().width / 2
            )
            .intersectionWithLineFromCenterToPoint(
              this.actionContext.dragging.pt
            );
        }

        if (srcPt) {
          // - draw
          this.actionContext.dragging.arrow = joint.V("line", {
            x1: srcPt.x,
            y1: srcPt.y,
            x2: dstPt.x,
            y2: dstPt.y,
            stroke: common.DESIGN_CONNECTING_COLOR,
            "stroke-width": 2,
          });
          joint
            .V(this.$refs.paper.querySelectorAll("svg")[0])
            .append(this.actionContext.dragging.arrow);
        }
      }
    },

    /*addLinkMove(evt) {
      //this.$util.log(`[CompositeInternals] addLinkMove()`);
      // - detect cells
      let pt = this.paper.clientToLocalPoint({ x: evt.pageX, y: evt.pageY });
      let cells = this.graph.findModelsFromPoint(pt);
      if (cells.length) {
        // - over a cell
        this.$set(this.actionContext, "cell", cells[0]); // get only first cell
        if (
          ["basic", "composite"].includes(this.actionContext.cell.get("type"))
        ) {
          this.$util.log("over component!");
          // - we are over a component
          if (this.actionContext.dragging) {
            // - destinaton is a component
            // - check if connection is possible
            if (
              ["basic", "composite"].includes(
                this.actionContext.dragging.cell.get("type")
              )
            ) {
              // - if source is a component then check source/destination
              //   endpoints compatibility
              let src = this.actionContext.dragging.cell.get("endpoints")[
                this.actionContext.dragging.port.id
              ];
              if (src.type === "out")
                this.$set(
                  this.actionContext,
                  "port",
                  this.actionContext.cell.findPortFromPoint(pt, "in")
                );
              if (this.actionContext.port) {
                let dst = this.actionContext.cell.get("endpoints")[
                  this.actionContext.port.id
                ];
                if (dst.protocol !== src.protocol)
                  this.$delete(this.actionContext, "port");
              }
            } else if (
              this.actionContext.dragging.cell.get("type") === "connector"
            ) {
              // - if source is a connector then identify a source component
              //   and check endpoints compatibility
              this.$set(
                this.actionContext,
                "port",
                this.actionContext.cell.findPortFromPoint(pt, "in")
              );
              if (this.actionContext.port) {
                let con = this.component.connectors[
                  this.actionContext.dragging.cell.id
                ];
                if (con.inputs && con.inputs.length) {
                  let [srcSubcomponent, srcEndpoint] = con.inputs[0].split(
                    this.$util.constants.MAPPING_SEPARATOR
                  );
                  let comp = common.findComponentByRoute(
                    this.components,
                    common.route(this.currentRoute, srcSubcomponent)
                  );
                  let src = comp.endpoints[srcEndpoint];
                  let dst = this.actionContext.cell.get("endpoints")[
                    this.actionContext.port.id
                  ];
                  if (dst.protocol !== src.protocol)
                    this.$delete(this.actionContext, "port");
                }
              }
            }
          } else {
            this.$set(
              this.actionContext,
              "port",
              this.actionContext.cell.findPortFromPoint(pt, "out")
            );
          }

          if (!this.actionContext.port)
            this.$delete(this.actionContext, "cell");
        } else if (this.actionContext.cell.get("type") === "connector") {
          this.$util.log("over connector!");
          // - we are over a connector
          if (this.actionContext.dragging) {
            // - destination is a connector
            // - check if connection is possible
            if (this.actionContext.dragging.cell.get("type") === "connector") {
              // - source is connection too: connector -> connector not possible
              this.$delete(this.actionContext, "cell");
            } else if (
              ["basic", "composite"].includes(
                this.actionContext.dragging.cell.get("type")
              )
            ) {
              // - source is component: identify destination component and
              //   check compatibility
              let con = this.component.connectors[this.actionContext.cell.id];
              if (con.outputs && con.outputs.length) {
                let [dstSubcomponent, dstEndpoint] = con.outputs[0].split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                let comp = common.findComponentByRoute(
                  this.components,
                  common.route(this.currentRoute, dstSubcomponent)
                );
                let src = this.actionContext.dragging.cell.get("endpoints")[
                  this.actionContext.dragging.port.id
                ];
                let dst = comp.endpoints[dstEndpoint];
                if (dst.protocol !== src.protocol)
                  this.$delete(this.actionContext, "cell");
              }
            }
          } else {
            // do nothing
          }
        } else {
          this.$delete(this.actionContext, "cell");
        }
      }

      // - detect repeated links
      if (this.actionContext.dragging && this.actionContext.cell) {
        let links = this.graph.getLinks();
        if (
          _.find(links, (link) => {
            let source = link.get("source");
            let target = link.get("target");
            return (
              source.id === this.actionContext.dragging.cell.id &&
              source.port ===
                (this.actionContext.dragging.port &&
                  this.actionContext.dragging.port.id) &&
              target.id === this.actionContext.cell.id &&
              target.port ===
                (this.actionContext.cell.port &&
                  this.actionContext.cell.port.id)
            );
          })
        ) {
          this.$delete(this.actionContext, "cell");
        }
      }

      // - (un)highlight
      if (
        this.actionContext.dragging &&
        this.actionContext.dragging.cell === this.actionContext.overCell
      ) {
        // do nothing (source cell remains highlighted)
      } else if (
        this.actionContext.port &&
        this.actionContext.overPort &&
        this.actionContext.port !== this.actionContext.overPort
      ) {
        this.actionContext.overCell.highlightPort(
          this.actionContext.overPort.id,
          { type: "light" },
          false
        );
        this.actionContext.cell.highlightPort(
          this.actionContext.port.id,
          { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
          true
        );
      } else if (this.actionContext.port && !this.actionContext.overPort) {
        this.actionContext.overCell &&
          this.actionContext.overCell.highlight({ type: "light" }, false);
        this.actionContext.cell.highlightPort(
          this.actionContext.port.id,
          { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
          true
        );
      } else if (!this.actionContext.port && this.actionContext.overPort) {
        this.actionContext.overCell.highlightPort(
          this.actionContext.overPort.id,
          { type: "light" },
          false
        );
        this.actionContext.cell &&
          this.actionContext.cell.highlight(
            { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
            true
          );
      } else if (!this.actionContext.port) {
        this.actionContext.overCell &&
          this.actionContext.overCell.highlight({ type: "light" }, false);
        this.actionContext.cell &&
          this.actionContext.cell.highlight(
            { type: "light", color: common.DESIGN_PORT_CONNECTING_COLOR },
            true
          );
      }
      this.$set(this.actionContext, "overCell", this.actionContext.cell);
      this.$set(this.actionContext, "overPort", this.actionContext.port);
      this.$delete(this.actionContext, "cell");
      this.$delete(this.actionContext, "port");

      if (this.actionContext.dragging) {
        let paperPt = this.paper.localToPaperPoint(pt);

        this.actionContext.dragging.arrow &&
          this.actionContext.dragging.arrow.remove();
        delete this.actionContext.dragging.arrow;

        let srcPt, dstPt;

        // - calculate arrow source
        if (
          this.actionContext.dragging.port &&
          this.actionContext.dragging.pt.distance(paperPt) >
            common.DESIGN_PORT_RADIUS
        ) {
          // - source is port:
          // - calculate arrow source from source port perimeter
          srcPt = joint.g
            .ellipse(
              this.actionContext.dragging.pt,
              common.DESIGN_PORT_RADIUS,
              common.DESIGN_PORT_RADIUS
            )
            .intersectionWithLineFromCenterToPoint(paperPt);
        } else if (
          !this.actionContext.dragging.port &&
          this.actionContext.dragging.pt.distance(paperPt) >
            this.actionContext.dragging.cell.size().width / 2
        ) {
          // - source is connector:
          // - calculate arrow source from source cell perimeter
          srcPt = joint.g
            .ellipse(
              this.actionContext.dragging.pt,
              this.actionContext.dragging.cell.size().width / 2,
              this.actionContext.dragging.cell.size().width / 2
            )
            .intersectionWithLineFromCenterToPoint(paperPt);
        }

        // - calculate arrow destination
        dstPt = paperPt;
        if (
          this.actionContext.overPort &&
          this.actionContext.dragging.port !== this.actionContext.overPort
        ) {
          // - destination is port:
          // - calculate arrow destination from destination port perimeter
          let centerPt = this.actionContext.overCell.getPortPosition(
            this.actionContext.overPort.id
          );
          centerPt.x += this.actionContext.overCell.position().x;
          centerPt.y += this.actionContext.overCell.position().y;
          centerPt = this.paper.localToPaperPoint(centerPt);
          dstPt = joint.g
            .ellipse(
              centerPt,
              common.DESIGN_PORT_RADIUS,
              common.DESIGN_PORT_RADIUS
            )
            .intersectionWithLineFromCenterToPoint(
              this.actionContext.dragging.pt
            );
        } else if (
          !this.actionContext.overPort &&
          this.actionContext.overCell
        ) {
          // - destination is connector:
          // - calculate arrow destination from destination cell perimeter
          let centerPt = {
            x:
              this.actionContext.overCell.position().x +
              this.actionContext.overCell.size().width / 2,
            y:
              this.actionContext.overCell.position().y +
              this.actionContext.overCell.size().height / 2,
          };
          dstPt = joint.g
            .ellipse(
              this.paper.localToPaperPoint(centerPt),
              this.actionContext.overCell.size().width / 2,
              this.actionContext.overCell.size().width / 2
            )
            .intersectionWithLineFromCenterToPoint(
              this.actionContext.dragging.pt
            );
        }

        if (srcPt) {
          // - draw
          this.actionContext.dragging.arrow = joint.V("line", {
            x1: srcPt.x,
            y1: srcPt.y,
            x2: dstPt.x,
            y2: dstPt.y,
            stroke: common.DESIGN_CONNECTING_COLOR,
            "stroke-width": 2,
          });
          joint
            .V(this.$refs.paper.querySelectorAll("svg")[0])
            .append(this.actionContext.dragging.arrow);
        }
      }
    },*/

    addLinkUp(evt) {
      this.$util.log(`[CompositeInternals] addLinkUp()`);
      // - if dragging in progress
      if (this.actionContext.dragging) {
        if (
          this.actionContext.overCell &&
          this.actionContext.overCell !== this.actionContext.dragging.cell
        ) {
          let event;
          // - if source is different from destination
          if (
            ["basic", "composite"].includes(
              this.actionContext.dragging.cell.get("type")
            ) &&
            ["basic", "composite"].includes(
              this.actionContext.overCell.get("type")
            )
          ) {
            // - component -> component
            // - get paper position
            let srcPt = this.actionContext.dragging.cell.position();
            let dstPt = this.actionContext.overCell.position();
            let midPt = {
              x: srcPt.x + (dstPt.x - srcPt.x) / 2,
              y: srcPt.y + (dstPt.y - srcPt.y) / 2,
            };
            event = {
              type: this.action.name,
              src: `${this.actionContext.dragging.cell.id}${this.$util.constants.MAPPING_SEPARATOR}${this.actionContext.dragging.port.id}`,
              dst: `${this.actionContext.overCell.id}${this.$util.constants.MAPPING_SEPARATOR}${this.actionContext.overPort.id}`,
              layout: {
                position: midPt,
              },
            };
          } else if (
            this.actionContext.dragging.cell.get("type") === "connector"
          ) {
            // - connector -> component
            event = {
              type: this.action.name,
              src: this.actionContext.dragging.cell.id,
              dst: `${this.actionContext.overCell.id}${this.$util.constants.MAPPING_SEPARATOR}${this.actionContext.overPort.id}`,
            };
          } else if (this.actionContext.overCell.get("type") === "connector") {
            // - component -> connector
            event = {
              type: this.action.name,
              src: `${this.actionContext.dragging.cell.id}${this.$util.constants.MAPPING_SEPARATOR}${this.actionContext.dragging.port.id}`,
              dst: this.actionContext.overCell.id,
            };
          }

          // - trigger action
          this.$emit("action", event);
        }

        // - unhighlight both ends
        this.actionContext.dragging.port &&
          this.actionContext.dragging.cell.highlightPort(
            this.actionContext.dragging.port.id,
            { type: "light" },
            false
          );
        this.actionContext.dragging.port ||
          this.actionContext.dragging.cell.highlight({ type: "light" }, false);
        this.actionContext.overPort &&
          this.actionContext.overCell.highlightPort(
            this.actionContext.overPort.id,
            { type: "light" },
            false
          );
        this.actionContext.overCell &&
          this.actionContext.overCell.highlight({ type: "light" }, false);

        // - clear dragging info
        this.actionContext.dragging.arrow &&
          this.actionContext.dragging.arrow.remove();
        this.actionContext.dragging = null;
      }
    },

    addLinkDestroy() {
      this.$util.log(`[CompositeInternals] addLinkDestroy()`);
      //this.paper.setInteractivity(true);
      this.showOverlay = false;
    },

    importConnectorInit() {
      this.addConnectorInit();
    },
    importConnectorLeave(evt) {
      this.addConnectorLeave(evt);
    },
    importConnectorMove(evt) {
      this.addConnectorMove(evt);
    },
    importConnectorDown(evt) {
      this.addConnectorDown(evt);
    },
    importConnectorUp(evt) {
      this.addConnectorUp(evt);
    },
    importConnectorDestroy(evt) {
      this.addConnectorDestroy();
    },

    /**
     * Checks connection endpoints/connectors compatibility according
     * to current action.
     *
     * @param {Object|string} src - The source endpoint or connector
     *                              (if Object then {subcomponent, endpoint})
     * @param {Object|string} dst - The destination endpoint or connector
     *                              (if Object then {subcomponent, endpoint})
     * @return {boolean} - True if compatible, false otherwise
     */
    checkConnectionCompatibility(src, dst) {
      this.$util.log(
        `[CompositeInternals] checkCompatibility(${JSON.stringify(
          src
        )},${JSON.stringify(dst)})`
      );
      // [TODO] detect repeated links!!
      if (this.action.name == "addLink") {
        let srcCon, srcEP, dstCon, dstEP;
        if (_.isString(src)) srcCon = this.component.connectors[src];
        else if (src)
          srcEP = common.findComponentByRoute(
            this.components,
            this.componentRoute,
            src.subcomponent
          ).endpoints[src.endpoint];
        if (_.isString(dst)) dstCon = this.component.connectors[dst];
        else if (dst)
          dstEP = common.findComponentByRoute(
            this.components,
            this.componentRoute,
            dst.subcomponent
          ).endpoints[dst.endpoint];
        this.$util.log(`${JSON.stringify(srcCon)},${JSON.stringify(dstCon)}`);
        if (srcCon && dstCon) return false;
        if (srcEP && srcEP.type != "out") return false;
        if (dstEP && dstEP.type != "in") return false;
        if (srcCon && dstEP) {
          // look for indirectly attached subcomponents
          if (srcCon.inputs && srcCon.inputs.length) {
            let [subcomp, subcompEP] = srcCon.inputs[0].split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            let comp = common.findComponentByRoute(
              this.components,
              this.currentRoute,
              subcomp
            );
            if (comp.endpoints && comp.endpoints[subcompEP]) {
              return comp.endpoints[subcompEP].protocol == dstEP.protocol;
            }
            return false;
          }
        }
        if (dstCon && srcEP) {
          // look for indirectly attached subcomponents
          if (dstCon.outputs && dstCon.outputs.length) {
            let [subcomp, subcompEP] = dstCon.outputs[0].split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            let comp = common.findComponentByRoute(
              this.components,
              this.currentRoute,
              subcomp
            );
            if (comp.endpoints && comp.endpoints[subcompEP]) {
              return comp.endpoints[subcompEP].protocol == srcEP.protocol;
            }
            return false;
          }
        }
        if (srcEP && dstEP) {
          return (
            srcEP.type == "out" &&
            dstEP.type == "in" &&
            srcEP.protocol == dstEP.protocol
          );
        }
        return true;
      } else if (this.action.name == "addConnector") {
        if (_.isString(src) || _.isString(dst)) return false;
        let srcEP, dstEP;
        if (src)
          srcEP = common.findComponentByRoute(
            this.components,
            this.componentRoute,
            src.subcomponent
          ).endpoints[src.endpoint];
        if (dst)
          dstEP = common.findComponentByRoute(
            this.components,
            this.componentRoute,
            dst.subcomponent
          ).endpoints[dst.endpoint];
        if (srcEP && srcEP.type != "out") return false;
        if (dstEP && dstEP.type != "in") return false;
        if (srcEP && dstEP) {
          return srcEP.protocol == dstEP.protocol;
        }
        return true;
      }
    },

    /*zoomInClick(ev) {
      this.$util.log(`[CompositeInternals] zoomInClick()`);
      this.zoomClick(ev);
    },
    zoomOutClick(ev) {
      this.$util.log(`[CompositeInternals] zoomOutClick()`);
      this.zoomClick(ev);
    },
    zoomClick(ev) {
      this.$util.log(`[CompositeInternals] zoomClick()`);
      /*let pt = this.paper.pageToLocalPoint(ev.pageX, ev.pageY);

      var rect = e.target.getBoundingClientRect();
      let ptRel = {
        x: e.clientX - rect.left, //x position within the element.
        y: e.clientY - rect.top   //y position within the element.
      };
      let offset = {
        x: ptRel.x - this.$refs.container.offsetWidth/2,
        y: ptRel.y - this.$refs.container.offsetHeight/2
      };

      offset.x = offset.x*scale;
      offset.y = offset.y*scale;*

      let scale = this.paper.scale().sx;
      scale = this.currentAction.name == "zoomIn" ? scale / 0.8 : scale * 0.8;
      this.paper.scale(scale, scale);

      /*offset.x = this.currentAction.name == "zoomIn" ? offset.x / 0.8: offset.x*0.8;
      offset.y = this.currentAction.name == "zoomIn" ? offset.y / 0.8: offset.y*0.8;*

      this.doDisplay();
    },*/


    /**
     * Handler called when a new subcomponent gets selected.
     *
    onSelect() {
      this.$util.log(`[CompositeInternals] onSelect(${this.currentAction.data})`);

      if (this.currentAction.data) {
        // look for subcomponent with the specified id
        let cell = this.graph.getCell(this.currentAction.data);

        // - if already selected do nothing
        if (
          this.actionContext.selectedCell === cell
        )
          return;

        // - if another was previously selected deselect it
        if (
          this.actionContext.selectedCell !== cell
        ) {
          if (this.actionContext.selectedCell) {
            this.actionContext.selectedCell &&
              this.actionContext.selectedCell.highlight &&
              this.actionContext.selectedCell.highlight(
                { type: "select" },
                false
              );

            // [TODO: hide menu]
          }
        }
        this.actionContext.selectedCell = cell;

        if (cell) {
          this.actionContext.selectedCell.highlight &&
            this.actionContext.selectedCell.highlight(
              { type: "select" },
              true
            );
          // [TODO: show menu]
        }
      } else {
        if (this.actionContext.selectedCell) {
          this.actionContext.selectedCell.highlight &&
            this.actionContext.selectedCell.highlight(
              { type: "select" },
              false
            );

          // unselect
          delete this.actionContext.selectedCell;

          // [TODO: hide menu]
          //let view = this.selectedCell.findView(this.paper);
        }
      }
    },*/

    /**
     * Select the specified element.
     *
     * @param {boolean} selected - Determines whether select/unselect element
     * @param {Object|string} cell - The selected cell or
     *
    select(selected, cell, opts) {
      this.$util.log(`[CompositeInternals] select(${selected})`);

      // - emit event to parent
      if (selected && cell) {
        this.$emit("action", {
          type: "select",
          selectedId: cell.get("id"),
          selectedType: cell.get("type"),
        });
      } else {
        this.$emit("action", { type: "select" });
      }
    },*/

    /**
     * Select the specified element.
     *
     * @param {boolean} selected - Determines whether select/unselect element
     * @param {Object|string} cell - The selected cell or
     *
    select(selected, cell, opts) {
      this.$util.log(`[CompositeInternals] select(${selected})`);
      if (selected) {
        // - if already selected do nothing
        if (
          this.selectedCell === cell &&
          !opts /*.isEqual(self.selected.opts, opts)*
        )
          return;

        // - if another was previously selected deselect it
        if (this.selected && this.selectedCell !== cell) {
          if (this.selectedCell) {
            this.selectedCell &&
              this.selectedCell.highlight &&
              this.selectedCell.highlight({ type: "select" }, false);

            console.dir(this.selectedCell);

            let view = this.selectedCell.findView(this.paper);
            view.removeTools(this.selected.toolsView);
            delete this.selected.toolsView;
          } else {
            /*self.$("#k-diagram-design-aggr-selector").hide();*
          }
        }

        this.selected = {
          cell: cell,
          opts: opts,
        };

        if (cell) {
          this.selectedCell.highlight &&
            this.selectedCell.highlight({ type: "select" }, true);

          // - emit event to parent
          this.$emit("action", {
            type: "select",
            path: this.selectedCell.get("id"),
          });
          // Component menu ---

          let btAddVolume = new joint.elementTools.Button({
            focusOpacity: 0.2,
            x: "30%",
            y: -30,
            offset: { x: 0, y: 0 },
            markup: [
              {
                tagName: "path",
                selector: "iconAddVolume",
                attributes: {
                  d:
                    "M18,14H20V17H23V19H20V22H18V19H15V17H18V14M12,3C16.42,3 20,4.79 20,7C20,9.21 16.42,11 12,11C7.58,11 4,9.21 4,7C4,4.79 7.58,3 12,3M4,9C4,11.21 7.58,13 12,13C16.42,13 20,11.21 20,9V9L20,12.08L19,12C16.41,12 14.2,13.64 13.36,15.94L12,16C7.58,16 4,14.21 4,12V9M4,14C4,16.21 7.58,18 12,18H13C13,19.05 13.27,20.04 13.75,20.9L12,21C7.58,21 4,19.21 4,17V14Z",
                  fill: "blue",
                  stroke: "none",
                  "stroke-width": 2,
                  cursor: "pointer",
                  "pointer-events": "all",
                  class: "myicon",
                },
              },
            ],
            action: () => {
              this.$util.log("ADD VOLUME!!");
            },
          });
          let btToBack = new joint.elementTools.Button({
            focusOpacity: 0.2,
            x: "30%",
            y: -30,
            offset: { x: 30, y: 0 },
            markup: [
              {
                tagName: "path",
                selector: "iconToBack",
                attributes: {
                  d: "M2,2H16V16H2V2M22,8V22H8V18H18V8H22M4,4V14H14V4H4Z",
                  fill: "blue",
                  stroke: "none",
                  "stroke-width": 2,
                  cursor: "pointer",
                  "pointer-events": "all",
                  class: "myicon",
                },
              },
            ],
            action: () => {
              this.$util.log("TO BACK!!");
            },
          });
          let btToFront = new joint.elementTools.Button({
            focusOpacity: 0.2,
            x: "30%",
            y: -30,
            offset: { x: 60, y: 0 },
            markup: [
              {
                tagName: "path",
                selector: "iconToFront",
                attributes: {
                  d:
                    "M2,2H11V6H9V4H4V9H6V11H2V2M22,13V22H13V18H15V20H20V15H18V13H22M8,8H16V16H8V8Z",
                  fill: "blue",
                  stroke: "none",
                  "stroke-width": 2,
                  cursor: "pointer",
                  "pointer-events": "all",
                  class: "myicon",
                },
              },
            ],
            action: () => {
              this.$util.log("TO FRONT!!");
            },
          });
          let btDelete = new joint.elementTools.Button({
            x: "30%",
            y: -30,
            offset: { x: 90, y: 0 },
            markup: [
              {
                tagName: "path",
                selector: "iconDelete",
                attributes: {
                  d:
                    "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z",
                  fill: "blue",
                  stroke: "none",
                  "stroke-width": 2,
                  cursor: "pointer",
                  "pointer-events": "all",
                  class: "myicon",
                },
              },
            ],
            action: () => {
              this.$util.log("DELETE!!");
            },
          });

          this.selected.toolsView = new joint.dia.ToolsView({
            tools: [btAddVolume, btToBack, btToFront, btDelete],
          });

          let view = this.selectedCell.findView(this.paper);
          view.addTools(this.selected.toolsView);

          /* setTimeout(function () {
            self._panel(cell, opts);
          }, 0);*
        } else {
          /*self.$("#k-diagram-design-aggr-selector").show();
          setTimeout(function () {
            self._panel(self.container, opts);
          }, 0);*
        }
      } else {
        if (this.selected && this.selectedCell) {
          this.selectedCell.highlight &&
            this.selectedCell.highlight({ type: "select" }, false);
          let view = this.selectedCell.findView(this.paper);
          view.removeTools(this.selected.toolsView);
          delete this.selected.toolsView;
          delete this.selected;
        }
        this.$emit("action", { type: "select", path: null });
      }
    },*/

    doMenu() {
      this.$util.log(`[CompositeInternals] doMenu()`);
      if (this.actionContext.selectedCell && this.action.menu) {
        // - show menu
        //   we get container bounding rect
        //   we get cell bounding rect
        //   we get number of menu icons
        //   we calculate menu position
        let parentRect = this.$refs.container.getBoundingClientRect();
        let cellRect = this.actionContext.selectedCell.getBBox();
        cellRect = this.paper.localToPageRect(cellRect);
        let parentScroll = {
          x: this.$refs.container.scrollLeft,
          y: this.$refs.container.scrollTop,
        };
        let menuWidth = this.action.menu.length * 36;

        this.$set(
          this.actionContext,
          "menuTop",
          cellRect.y - parentRect.y + parentScroll.y - 40 /* offset */
        );
        this.$set(
          this.actionContext,
          "menuLeft",
          cellRect.x -
            parentRect.x +
            parentScroll.x +
            (cellRect.width - menuWidth) / 2 /* center */
        );
      }
    },

    /**
     * Deep diff between two object, using lodash
     * @param  {Object} object Object compared
     * @param  {Object} base   Object to compare with
     * @return {Object}        Return a new object who represent the diff
     */
    diff(object, base) {
      function changes(object, base) {
        return _.transform(object, function (result, value, key) {
          if (!_.isEqual(value, base[key])) {
            result[key] =
              _.isObject(value) && _.isObject(base[key])
                ? changes(value, base[key])
                : value;
          }
        });
      }
      return changes(object, base);
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.myicon:hover {
  fill: red !important;
}
.composite-internals-container {
  /*flex-grow: 1;*/
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  /*display: flex;
  flex-direction: column;*/
  /*overflow: auto;*/
  resize: none !important;
  /*height: 100%;
  width: 100%;*/

  /*max-height: 100%;
  height: 100%;
  min-height: 100%;
  width: 100%;
  overflow: auto;*/
}
.composite-internals-scrollable {
  position: relative;
  height: 100%;
  width: 100%;
  /*overflow: auto;*/
}
.composite-internals-overlay {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  z-index: 2;
}

.composite-internals-paper {
  /*flex-grow: 1;*/
  z-index: 1;
  /*overflow: auto;*/
}
.composite-internals-component {
  display: none;
  position: absolute;
  top: 30;
  left: 30;
  width: 120px;
  height: 80px;
  background-color: rgba(0, 0, 0, 0.2);
}
.composite-internals-connector {
  display: none;
  position: absolute;
  border-radius: 50%;
  width: 80px;
  height: 80px;
  background-color: rgba(0, 0, 0, 0.2);
}
.component-menu {
  z-index: 3;
}
</style>
<!-- 
  Global styles:
  - Required for overwriting some JointJS classes
-->
<style>
.connection-wrap {
  cursor: default !important;
}
</style>