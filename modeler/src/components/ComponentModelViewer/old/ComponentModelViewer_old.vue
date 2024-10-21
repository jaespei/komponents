<template>
  <div
    ref="container"
    style="
      max-height: 100%;
      height: 100%;
      min-height: 100%;
      width: 100%;
      overflow: auto;
    "
  >
    <div
      ref="paper"
      style="height: 100%; width: 100%"
      @pointermove="mouseMove"
      @pointerdown="mouseDown"
      @pointerup="mouseUp"
      @dblclick="mouseDblClick"
    ></div>
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
import ComponentView from "./views/ComponentView";

import TestViewModel from "./viewmodels/TestViewModel";

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
  name: "ComponentModelViewer",
  props: {
    components: { type: Object, required: true },
    layout: { type: Object },
    display: { type: Object },
    path: { type: String, default: "" },
    pathSeparator: { type: String, default: "/" },
    prefixSpecialProperty: { type: String, default: "@" },
    action: { type: String, default: "select" },
    mode: { type: String, default: "write" },
  },
  data() {
    return {
      background: {
        //color: "antiquewhite",
        color: "lightgray",
      },
      gridSize: 10,
      drawGrid: {
        name: "mesh",
      },
      selected: null,
    };
  },
  watch: {
    components: {
      deep: true,
      handler(value, old) {
        let diff = this.diff(value, this.componentsCache);
        console.log(
          `[ComponentModelViewer] watch.components(${JSON.stringify(diff)})`
        );
        this.componentsCache = _.cloneDeep(value);
      },
    },
    path(value) {
      console.log(`[ComponentModelViewer] watch.path(${value})`);
      this.navigate(value);
    },
    action(value) {
      console.log(`[ComponentModelViewer] watch.action(${value})`);
      this.actionContext = {};
    },
  },
  created() {
    console.log(`[ComponentModelViewer] created()`);
    window.viewer = this;

    // Cache original model, to keep track of diffs
    this.componentsCache = _.cloneDeep(this.components);

    this.name = this.$options.name;
    this.actionContext = {};
  },
  mounted() {
    console.log(`[${this.name}] Mounted:`, this.$refs.paper);

    this.graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes });
    this.paper = new joint.dia.Paper({
      el: this.$refs.paper,
      //cellViewNamespace: joint.shapes,
      model: this.graph,
      width: "100%",
      height: "100%",
      //gridSize: this.gridSize,
      elementView: ComponentView,
      //drawGrid: this.drawGrid,
      background: this.background,
      interactive: this.mode == "write",
    });

    // - Notify layout changes to parent
    this.graph.on("change:position", (elem, position, opt) => {
      console.log(
        `[ComponentModelViewer] change(${elem.get("id")}, ${JSON.stringify(
          position
        )})`
      );
      let ev = {
        type: "layout",
        path: elem.get("id"),
        name: "position",
        value: position,
      };
      this.$emit("change", ev);
    });

    //this.$emit("init", this.graph);
    //this.setupGraph(this.graph);
    /*window.onresize = (ev) => {
      console.log(`[ComponentModelViewer] resize(${JSON.stringify(ev)})`);
      this.doDisplay();
    };*/
    this.clay = new Clay(this.$refs.container);
    this.clay.on("resize", (ev) => {
      console.log(`[ComponentModelViewer] resize(${JSON.stringify(ev)})`);
      this.doDisplay();
    });
    this.navigate(this.path, { nosave: true });
  },
  beforeDestroy() {
    console.log(`[${this.name}] beforeDestroy()`);
    /*window.onresize = null;*/
    this.clay.reset();
  },
  methods: {
    loadLayout() {
      console.log(`[ComponentModelViewer] loadLayout()`);

      // - clean previous layout
      this.graph.clear();

      let root = this.components[this.path];
      let layout = this.layout && this.layout[this.path];

      if (layout) {
        console.log(`layout found: ${JSON.stringify(layout)}`);
        // - If there is layout, then create all cells with related data
        let cells = [];
        if (layout.subcomponents) {
          layout.subcomponents.forEach((subcomp) => {
            console.log(
              "- processing subcomponent " + JSON.stringify(subcomp) + " ..."
            );
            subcomp = _.cloneDeep(subcomp);
            subcomp.model = this.components[
              `${this.path}${this.pathSeparator}${subcomp.type}`
            ];

            // - set read/write mode
            subcomp.mode = this.mode;

            console.log("- subcomponent component found!!");
            var cell;
            if (subcomp.model[`${this.prefixSpecialProperty}origin`]) {
              console.log("- creating external cell");
              /*cell = new ExternalVM(role);
            cell.resetPorts(role.endpoints);*/
            } else if (subcomp.type === "komponents.Basic") {
              console.log("- creating basic cell");
              cell = new BasicViewModel(subcomp);
              cell.resetPorts(subcomp.endpoints);
            } else if (subcomp.type === "komponents.Composite") {
              cell = new BasicViewModel(subcomp);
              cell.resetPorts(subcomp.endpoints);

              /*console.log("- creating composite cell");
            cell = new CompositeViewModel(subcomp);
            //cell.resetPorts(role.endpoints);*/
            }
            cells.push(cell);
          });
          /*layout.connectors.forEach((connector) => {
          console.log(
            "- processing connector " + JSON.stringify(connector) + " ..."
          );
          var cell = new ConnectorViewModel(connector);
          cells.push(cell);
        });
        layout.links.forEach(function (link) {
          console.log("- processing link " + JSON.stringify(link) + " ...");
          var cell = new LinkViewModel(link);
          cells.push(cell);
        });*/
        }

        this.graph.addCells(cells);
      } else {
        // - If there is not layout, then create all cells and let Joint create default layout
        var cells = [];

        let root = this.components[this.path];

        console.log(`root found: ${JSON.stringify(root)}`);

        // - add subcomponents to graph
        _.each(root.subcomponents, (subcomp, subcompId) => {
          var subcompType = this.components[
            `${this.path}${this.pathSeparator}${subcomp.type}`
          ];
          console.log(`subcomp found: ${JSON.stringify(subcompType)}`);
          var cell;
          if (subcompType[`${this.prefixSpecialProperty}origin`]) {
            /*cell = new ExternalVM({
              id: roleName,
              name: role.name,
              component: role.component,
              model: subcomp,
            });*/
          } else if (subcompType.type === "basic") {
            cell = new BasicViewModel({
              id: subcomp[`${this.prefixSpecialProperty}id`],
              name: subcomp[`${this.prefixSpecialProperty}name`],
              mode: this.mode,
              type: subcomp.type,
            });
          } else if (subcompType.type === "composite") {
            cell = new BasicViewModel({
              id: subcomp[`${this.prefixSpecialProperty}id`],
              name: subcomp[`${this.prefixSpecialProperty}name`],
              mode: this.mode,
              type: subcomp.type,
            });
            /*cell = new CompositeViewModel({
              id: subcompId,
              name: subcomp[`${this.prefixSpecialProperty}id`],
              mode: this.mode,
              component: subcomp.type,
              model: subcompType,
            });*/
          }
          cells.push(cell);
        });

        /*// - add connectors to graph
        _.each(root.connectors, (con, conId) => {
          if (con.type === "*") {
            // - '*' connectors are represented by links
            if (con.inputs.length === 1 && con.outputs.length === 1) {
              // - add single link
              var cell = new LinkViewModel({
                id: conId,
                source: {
                  id: con.outputs[0].role,
                  port: con.outputs[0].endpoint,
                },
                target: {
                  id: con.inputs[0].role,
                  port: con.inputs[0].endpoint,
                },
              });
              cells.push(cell);
            } else {
              // - '*' connector with multiple input/output is supported
              // - replace with n 1-1 connectors
              con.inputs.forEach((input) => {
                con.outputs.forEach((output) => {
                  var cell = new LinkViewModel({
                    id: common.uuid(),
                    source: {
                      id: output.role,
                      port: output.endpoint,
                    },
                    target: {
                      id: input.role,
                      port: input.endpoint,
                    },
                  });
                  cells.push(cell);
                });
              });
            }
          } else {
            // - 'lb' / 'ps' connectors are represented by
            //   connector + links
            var cell = new ConnectorViewModel({
              id: conId,
              name: con.type,
              published: false,
            });
            cells.push(cell);

            _.each(con.inputs, (input) => {
              cell = new LinkViewModel({
                id: common.uuid(),
                source: {
                  id: input.role,
                  port: input.endpoint,
                },
                target: {
                  id: conId,
                },
              });
              cells.push(cell);
            });

            _.each(con.outputs, (output) => {
              cell = new LinkViewModel({
                id: common.uuid(),
                source: {
                  id: conId,
                },
                target: {
                  id: output.role,
                  port: output.endpoint,
                },
              });
              cells.push(cell);
            });
          }
        });*/

        this.graph.addCells(cells);
        // - do layout
        joint.layout.DirectedGraph.layout(
          this.graph /*{setLinkVertices: false}*/,
          { dagre: dagre, graphlib: graphlib }
        );
      }
    },

    /**
     * Saves the current component layout into the model.
     */
    saveLayout() {
      console.log("[ComponentModelViewer] saveLayout()");
      /*var self = this;

        var layout = { roles: [], connectors: [], links: [] };
        self.graph.getCells().forEach(function (cell) {
            switch (cell.get('type')) {
                case 'komponents.Basic':
                case 'komponents.Aggregate':
                    var role = {
                        id: cell.id,
                        type: cell.get('type'),
                        name: cell.get('name'),
                        component: cell.get('component'),
                        position: cell.get('position'),
                        size: cell.get('size'),
                        endpoints: _.map(cell.getPorts(), function (port) {
                            return {
                                id: port.id,
                                name: port.name,
                                type: port.type,
                                position: cell.getPort(port.id).position
                            };
                        })
                    };
                    layout.roles.push(role);
                    break;
                case 'komponents.Connector':
                    var connector = {
                        id: cell.id,
                        type: cell.get('type'),
                        name: cell.get('name'),
                        published: cell.get('published'),
                        position: cell.get('position'),
                        size: cell.get('size')
                    };
                    layout.connectors.push(connector);
                    break;
                case 'komponents.Link':
                    var link = {
                        id: cell.id,
                        type: cell.get('type'),
                        source: cell.get('source'),
                        target: cell.get('target')
                    };
                    layout.links.push(link);
                    break;
                default:
            }

        });
        self.component.set('layout', layout); // JSON.stringify(layout));
        console.log('saved layout:');
        console.dir(layout);*/
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
      console.log(`[ComponentModelViewer] doDisplay(${JSON.stringify(opts)})`);

      opts = opts || {};

      let bbox = this.graph.getBBox();
      bbox = bbox || { x: 0, y: 0, width: 0, height: 0 };
      console.log(`bbox: ${JSON.stringify(bbox)}`);
      let container = opts.container || {
        width: this.$refs.container.offsetWidth,
        height: this.$refs.container.offsetHeight,
      };
      console.log(
        `bbox: ${JSON.stringify(bbox)}, container: ${JSON.stringify(container)}`
      );

      // - calculate margin
      /*let margin = _.isString(opts.margin) ? Number(opts.margin) : opts.margin;
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
      });*/
      let margin = { left: 0, right: 0, top: 0, bottom: 0 };

      // - calculate scale
      let ratioX = (container.width - margin.left - margin.right) / bbox.width;
      let ratioY =
        (container.height - margin.top - margin.bottom) / bbox.height;
      let scale = ratioX < ratioY ? ratioX : ratioY;

      console.log(`ratio: (${ratioX}, ${ratioY}}, scale: ${scale}`);

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
        /*let canvas = opts.canvas
          ? opts.canvas
          : {
              width: factorX + container.width * 2,
              height: factorY + container.height * 2,
            };*/
        let canvas = opts.canvas
          ? opts.canvas
          : {
              width: factorX,
              height: factorY,
            };
        console.log(
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
      console.log("[ComponentModelViewer] saveDisplay()");
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
     * Navigates to the specified component path, saving current layout.
     *
     * This means loading the destination component if not loaded
     * yet and jumping to it.
     *
     * @param {string} path - The component path to navigate to
     * @param {Object} [opts] - The options
     * @param {boolean} opts.nosave - Do not save current layout
     */
    navigate(path, opts) {
      console.log(
        `[ComponentModelViewer] navigate(${path}, ${JSON.stringify(opts)})`
      );
      var self = this;

      opts = opts || {};

      /*opts.role = opts.hasOwnProperty("role") ? opts.role : opts.path;
       */
      /*// - set busy state
      self.busy = true;
      self.triggerMethod("view:disable", { loader: true });

      try {*/

      // - look for component
      let comp = this.components[path];

      if (!opts.nosave) {
        this.saveLayout();
        this.saveDisplay();
      }

      let display = this.display[this.path] || { fit: true, center: true };

      // - load new component
      delete this.selected;
      this.actionContext = {};
      this.loadLayout();
      this.doDisplay(display);

      /*// - update paths:
        //      self.path: dot-sepparated list of component ids
        //      self.role: dot-sepparated list of role ids
        self.path = opts.path;
        self.role = opts.role;*/

      /*// - obtain role name (for user showing):
        //      dot-sepparated list of role names
        self.roleName = "";
        var subpaths = self.path.split(".").slice(1);
        var subroles = self.role.split(".").slice(1);
        var subcomp = self.components.get("");
        _.each(subroles, function (subrole, i) {
          console.log(i + "->" + subrole);
          self.roleName += "." + subcomp.get("roles")[subrole].name;
          subcomp = self._findComponent({
            path: "." + subpaths.slice(0, i).join("."),
            name: subcomp.get("roles")[subrole].component,
          });
        });

        // - fix displayed component
        self.component = comp;

        // - unset busy state
        self.busy = false;
        self.triggerMethod("view:enable");
        self.render();

        // - delete container
        if (self.container) {
          self.container.cleanUp();
          delete self.container;
        }
        // - create container
        if (self.path !== "") {
          var parent = self._findComponent(
            self.path.split(".").slice(0, -1).join(".")
          );
          var role = {
            id: self.role.split(".").slice(-1)[0],
            name: self.roleName.split(".").slice(-1)[0],
            component: self.path.split(".").slice(-1)[0],
          };
          if (parent.get("layout")) {
            // - load layout
            var layout = parent.get("layout"); // JSON.parse(parent.get('layout'));
            role = _.cloneDeep(
              _.find(layout.roles, function (_role) {
                return _role.id === role.id;
              })
            );
          }
          role.mode = self.opts.mode;
          role.model = self.component;
          role.el = self.gui.container.parent();

          self.container = new AggregateVM(role);
        }

        console.log(
          "[DiagramDesignView] _navigate(" + JSON.stringify(opts) + ") SUCCESS."
        );
      } catch (err) {
        console.log(
          "[DiagramDesignView] _navigate(" +
            JSON.stringify(opts) +
            ") ERROR: " +
            err.message +
            ".\n" +
            err.stack
        );
        self.busy = false;
        self.triggerMethod("view:enable");
        throw err;
      }*/
    },

    mouseMove(ev) {
      let methodName = `${this.action}Move`;
      this[methodName] && this[methodName](ev);
    },

    mouseDown(ev) {
      let methodName = `${this.action}Down`;
      this[methodName] && this[methodName](ev);
    },

    mouseUp(ev) {
      let methodName = `${this.action}Up`;
      this[methodName] && this[methodName](ev);
    },
    mouseDblClick(ev) {
      let methodName = `${this.action}DblClick`;
      this[methodName] && this[methodName](ev);
    },

    pointerMove(ev) {
      console.log(`[ComponentModelViewer] pointerMove(${this.selected})`);
      if (this.actionContext.dragging) {
        // - moving ports ...
        var localPt = this.paper.clientToLocalPoint({
          x: ev.pageX,
          y: ev.pageY,
        });
        var paperPt = this.paper.localToPaperPoint(localPt);
        this.dragging.circle && this.dragging.circle.remove();
        this.dragging.circle = joint.V("circle", {
          cx: paperPt.x,
          cy: paperPt.y,
          r: common.DESIGN_PORT_RADIUS * this.paper.scale().sx,
          stroke: common.DESIGN_PORT_MOVING_COLOR,
          "stroke-width": 2,
          fill: "transparent",
        });
        joint
          .V(document.getElementsByTagName("svg")[0])
          .append(this.actionContext.dragging.circle);

        let port = this.actionContext.overCell.getPort(
          this.actionContext.dragging.port
        );
        if (
          Math.abs(this.actionContext.overCell.position().x - localPt.x) < 10
        ) {
          this.actionContext.overCell.updatePort({
            id: this.actionContext.dragging.port,
            position: {
              x: 0,
              y: localPt.y - this.actionContext.overCell.position().y,
            },
          });
        } else if (
          Math.abs(
            this.actionContext.overCell.position().x +
              this.actionContext.overCell.size().width -
              localPt.x
          ) < 10
        ) {
          this.actionContext.overCell.updatePort({
            id: this.action.Context.dragging.port,
            position: {
              x: this.actionContext.overCell.size().width,
              y: localPt.y - this.actionContext.overCell.position().y,
            },
          });
        }
      } else {
        var pt = this.paper.pageToLocalPoint({ x: ev.pageX, y: ev.pageY });
        //var views = this.paper.findViewsFromPoint(pt);
        var cells = this.graph.findModelsFromPoint(pt);
        var cell = (cells.length && cells[0]) || null;

        if (
          this.actionContext.overCell &&
          cell !== this.actionContext.overCell
        ) {
          // - cell leave!!!

          // - if read-only enable moving
          if (this.mode === "read") {
            this.actionContext.overCell.state &&
              this.actionContext.overCell.state("dynamic");
          }

          this.actionContext.overCell.highlight &&
            this.actionContext.overCell.highlight({ type: "light" }, false);
          this.actionContext.overPort &&
            this.actionContext.overCell.highlightPort &&
            this.actionContext.overCell.highlightPort(
              this.actionContext.overPort.id,
              { type: "light" },
              false
            );
          this.actionContext.overIcon &&
            this.actionContext.overCell.highlightIcon &&
            this.actionContext.overCell.highlightIcon(
              this.actionContext.overIcon.id,
              { type: "light" },
              false
            );
          //self.gui.container.css('cursor', 'default');

          this.actionContext.overCell = null;
          this.actionContext.overPort = null;

          /*// ---- toolbar ----
                    self.gui.toolbar
                        .removeClass('k-diagram-design-tooltip-selected');*/
        }

        if (cell) {
          // - over cell ...
          //
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
            this.actionContext.overPort = null;
          }
          if (port && port !== this.actionContext.overPort) {
            // - over new port
            cell.highlightPort &&
              cell.highlightPort(port.id, { type: "light" }, true);
            if (this.mode === "write") cell.state && cell.state("static");
            this.actionContext.overPort = port;
          } else if (!port) {
            cell.highlight && cell.highlight({ type: "light" }, true);
            if (this.mode === "write") cell.state && cell.state("dynamic");
          }

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
            this.actionContext.overIcon = null;
          }
          if (icon && icon !== this.actionContext.overIcon) {
            // - over new port
            cell.highlightIcon &&
              cell.highlightIcon(icon.id, { type: "light" }, true);
            this.actionContext.overIcon = icon;
          }

          if (cell !== this.actionContext.overCell) {
            // - cell enter!!!
            //
            this.actionContext.overCell = cell;

            // - if read-only disable moving
            if (this.mode === "read") {
              this.actionContext.overCell.state &&
                this.actionContext.overCell.state("static");
            }

            /*// ---- toolbar ----
                        var old = self.gui.toolbar.find('ul').attr('data-cell');
                        if (old && self.graph.getCell(old) && self.cleanUpToolbar) {
                            self.cleanUpToolbar();
                            _.remove(self.cleanUp, function (hook) {
                                return hook === self.cleanUpToolbar;
                            });
                        }

                        // - generate toolbar
                        var toolbar = self._toolbar(cell);
                        if (toolbar && toolbar.length) {
                            var html = '<ul data-cell="' + cell.id + '">';
                            toolbar.forEach(function (action) {
                                html += '<li><a href="#" class="k-diagram-design-toolbar-action" data-action="' + action.name + '" data-cell="' + cell.id + '">' + action.icon + '</a></li>';
                            });
                            html += '</ul>';
                            self.gui.toolbar.html(html);

                            var onChangePosition = function () {
                                calcToolbar(toolbar, cell);
                            };
                            var onChangeSize = function () {
                                calcToolbar(toolbar, cell);
                            };
                            var onRemoveCell = function (_cell) {
                                console.log('onRemoveCell');
                                if (_cell === cell) {
                                    if (self.cleanUpToolbar) {
                                        self.cleanUpToolbar();
                                        _.remove(self.cleanUp, function (hook) {
                                            return hook === self.cleanUpToolbar;
                                        });
                                    }

                                    // trick for removing visible toolbar
                                    self.gui.toolbar &&
                                        self.gui.toolbar
                                            .removeClass('k-diagram-design-tooltip')
                                            .removeClass('k-diagram-design-tooltip-selected')
                                            .css('visibility', 'hidden');
                                }
                            };

                            cell.on('change:position', onChangePosition)
                                .on('change:size', onChangeSize);
                            self.graph.on('remove', onRemoveCell);

                            self.cleanUpToolbar = function () {
                                console.log('- cleanUp hook -> cleanUpToolbar()');
                                cell.off('change:position', onChangePosition)
                                    .off('change:size', onChangeSize);
                                self.graph.off('remove', onRemoveCell);
                                delete self.cleanUpToolbar;
                            };
                            self.cleanUp.push(self.cleanUpToolbar);

                            calcToolbar(toolbar, cell);
                        }*/
          }
        }
      }
    },
    pointerDown(ev) {
      console.log(`[ComponentModelViewer] pointerDown()`);
      this.pointerMove(ev); // this enables pointer behaviour
      if (this.actionContext.overPort) {
        if (this.mode === "write") {
          var pt = this.actionContext.overCell.getPortPosition(
            this.actionContext.overPort.id
          );
          pt.x += this.actionContext.overCell.position().x;
          pt.y += this.actionContext.overCell.position().y;
          pt = this.paper.localToPaperPoint(pt);
          this.actionContext.dragging = {
            cell: this.actionContext.overCell,
            port: this.actionContext.overPort.id,
            pt: pt,
          };

          this.actionContext.dragging.circle = joint.V("circle", {
            cx: pt.x,
            cy: pt.y,
            r: common.DESIGN_PORT_RADIUS * this.paper.scale().sx,
            stroke: common.DESIGN_PORT_MOVING_COLOR,
            "stroke-width": 2,
            fill: "transparent",
          });
          joint
            .V(document.getElementsByTagName("svg")[0])
            .append(this.actionContext.dragging.circle);
        }
        this.select(true, this.actionContext.overCell, {
          section: "endpoints",
          item: this.actionContext.overPort.id,
        });
        /*// - show port on panel
        setTimeout(function () {
          self.triggerMethod("select", true, overCell, {
            section: "endpoints",
            item: overPort.id,
          });
        }, 0);*/
      } else if (this.actionContext.overIcon) {
        // - show icon type on panel
        this.select(true, this.actionContext.overCell, {
          section: this.actionContext.overIcon.name,
        });
        /*setTimeout(function () {
          self.triggerMethod("select", true, overCell, {
            section: overIcon.name,
          });
        }, 0);*/
      } else if (this.actionContext.overCell) {
        // cell clicked
        this.select(true, this.actionContext.overCell);
        /*self.triggerMethod("select", true, overCell);*/
      } else if (this.actionContext.overLink) {
        // link clicked
        /*self.triggerMethod("select", true, overLink);*/
      } else if (this.path !== "") {
        // container clicked
        this.select(false);
        /*self.triggerMethod("select", true);*/
      } else {
        // blank clicked
        this.select(false);
        /*self.triggerMethod("select", false);*/
      }
    },
    pointerUp(ev) {
      console.log(`[ComponentModelViewer] pointerUp()`);
      if (this.actionContext.dragging) {
        //overCell.highlightPort(dragging.port.id, {type: 'light'}, false);

        this.actionContext.dragging.circle &&
          this.actionContext.dragging.circle.remove();
        this.actionContext.dragging = null;
        this.pointerMove(ev);
      }
    },
    pointerDblClick(ev) {
      console.log(`[ComponentModelViewer] pointerDblClick(${this.overCell})`);
      if (this.actionContext.overCell && this.action == "pointer") {
        console.log("ello");
        /*let path = `${this.path}${this.pathSeparator}${this.overCell.get('type')}`;
        let component = this.components[path];*/
        this.$emit("action", {
          type: "dblclick",
          path: this.actionContext.overCell.get("id"),
        });
      }
    },
    setupGraph(graph) {
      let model = new ComponentModel({
        name: "pepe",
        cardinality: "[2:10]",
        variables: {
          var1: "pepe",
        },
        volumes: {
          vol: "pepe",
        },
        endpoints: {
          ep1: {
            name: "name",
            type: "in",
          },
          ep2: {
            name: "ep2_name",
            type: "out",
          },
        },
      });

      let basic = new BasicViewModel({
        id: "pepe",
        name: "pepeeeeeeeeeeeeeeeeeeee",
        mode: "write",
        component: "pepe",
        model: model,
        position: { x: 300, y: 100 },
      });
      basic.addTo(graph);

      /*let boundaryTool = new joint.elementTools.Boundary();
      let removeTool = new joint.elementTools.Remove();
      let btTool = new joint.elementTools.Button({
        focusOpacity: 0.5,
        // top-right corner
        x: "100%",
        y: "0%",
        offset: { x: -20, y: -10 },
        markup: [
          {
            tagName: "rect",
            selector: "button",
            attributes: {
              width: 10,
              height: 10,
              cursor: "pointer",
              stroke: "black",
              fill: "#001DFF",
            },
          },
          {
            tagName: "path",
            selector: "icon",
            attributes: {
              d:
                "M18,14H20V17H23V19H20V22H18V19H15V17H18V14M12,3C16.42,3 20,4.79 20,7C20,9.21 16.42,11 12,11C7.58,11 4,9.21 4,7C4,4.79 7.58,3 12,3M4,9C4,11.21 7.58,13 12,13C16.42,13 20,11.21 20,9V9L20,12.08L19,12C16.41,12 14.2,13.64 13.36,15.94L12,16C7.58,16 4,14.21 4,12V9M4,14C4,16.21 7.58,18 12,18H13C13,19.05 13.27,20.04 13.75,20.9L12,21C7.58,21 4,19.21 4,17V14Z",
              fill: "blue",
              stroke: "none",
              "stroke-width": 2,
              cursor: "pointer",
              //"pointer-events": "none",
            },
          },
        ] /*[
          {
            tagName: "circle",
            selector: "button",
            attributes: {
              r: 7,
              fill: "#001DFF",
              cursor: "pointer",
            },
          },
          {
            tagName: "path",
            selector: "icon",
            attributes: {
              d: common.icons.volume,//"M -2 4 2 4 M 0 3 0 0 M -2 -1 1 -1 M -1 -4 1 -4",
              fill: "none",
              stroke: "#FFFFFF",
              "stroke-width": 2,
              "pointer-events": "none",
            },
          },
        ],,
        action: () => {
          console.log("ACTION!!");
        },
      });
      let toolsView = new joint.dia.ToolsView({
        tools: [boundaryTool, removeTool, btTool],
      });

      let basicView = basic.findView(this.paper);
      basicView.addTools(toolsView);

      this.paper.on("component:menu:pointerdown", (elemView, evt, x, y) => {
        console.log(`menu!!!`);
        console.dir(evt);
      });*/

      window.basic = basic;

      /*let basic = new Basic();
      basic.position(200, 30);
      basic.resize(100, 40);
      //basic.attr({label: {text: "Helloooooooooooo"}});
      basic.resize(100, 40);
      basic.addPort({id: 'hey'});
      basic.addTo(graph);*/
      /* const rect = new this.$joint.shapes.standard.Rectangle();
      rect.position(100, 30);
      rect.resize(100, 40);
      rect.attr({
        body: {
          fill: "blue",
        },
        label: {
          text: "Hello",
          fill: "white",
        },
      });
      rect.addTo(graph);

      const rect2 = rect.clone();
      rect2.translate(300, 0);
      rect2.attr("label/text", "World!");
      rect2.addTo(graph);

      const link = new this.$joint.shapes.standard.Link();
      link.source(rect);
      link.target(rect2);
      link.addTo(graph);*/
    },

    select(selected, cell, opts) {
      console.log(`[ComponentModwlViewer] select(${selected})`);
      if (selected) {
        // - if already selected do nothing
        if (
          this.selected &&
          this.selected.cell === cell &&
          !opts /*.isEqual(self.selected.opts, opts)*/
        )
          return;

        // - if another was previously selected deselect it
        if (this.selected && this.selected.cell !== cell) {
          if (this.selected.cell) {
            this.selected.cell &&
              this.selected.cell.highlight &&
              this.selected.cell.highlight({ type: "select" }, false);

            console.dir(this.selected.cell);

            let view = this.selected.cell.findView(this.paper);
            view.removeTools(this.selected.toolsView);
            delete this.selected.toolsView;
          } else {
            /*self.$("#k-diagram-design-aggr-selector").hide();*/
          }
        }

        this.selected = {
          cell: cell,
          opts: opts,
        };

        if (cell) {
          this.selected.cell.highlight &&
            this.selected.cell.highlight({ type: "select" }, true);

          // - emit event to parent
          this.$emit("action", {
            type: "select",
            path: this.selected.cell.get("id"),
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
              console.log("ADD VOLUME!!");
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
              console.log("TO BACK!!");
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
              console.log("TO FRONT!!");
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
              console.log("DELETE!!");
            },
          });

          this.selected.toolsView = new joint.dia.ToolsView({
            tools: [btAddVolume, btToBack, btToFront, btDelete],
          });

          let view = this.selected.cell.findView(this.paper);
          view.addTools(this.selected.toolsView);

          /* setTimeout(function () {
            self._panel(cell, opts);
          }, 0);*/
        } else {
          /*self.$("#k-diagram-design-aggr-selector").show();
          setTimeout(function () {
            self._panel(self.container, opts);
          }, 0);*/
        }
      } else if (this.selected) {
        if (this.selected.cell) {
          this.$emit("action", { type: "select", path: null });
          this.selected.cell.highlight &&
            this.selected.cell.highlight({ type: "select" }, false);
          let view = this.selected.cell.findView(this.paper);
          view.removeTools(this.selected.toolsView);
          delete this.selected.toolsView;
        } else {
          /*self.$("#k-diagram-design-aggr-selector").hide();*/
        }
        delete this.selected;
        /*self.views.panel.refresh("Nothing selected");*/
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
</style>
