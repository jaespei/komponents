<template>
  <div class="component-model-container" ref="container">
    <!-------- Path -------->
    <v-toolbar elevation="0" maxHeight="64px" ref="toolbar">
      <v-btn
        v-if="currentRoute != ''"
        icon
        @click="navigate(currentSubroutes.slice(0, -1).join(pathSeparator))"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <template v-for="(name, index) in currentRouteNames">
        <v-btn
          :key="'span' + currentSubroutes.slice(0, index + 2).join('/')"
          @click="navigate(currentSubroutes.slice(0, index + 2).join('/'))"
          plain
          >{{ name }}</v-btn
        >
        <v-icon
          :key="'icon' + currentRouteNames.slice(1, index + 1).join('/')"
          v-if="index < currentRouteNames.length - 1"
          >mdi-chevron-right</v-icon
        >
      </template>
    </v-toolbar>

    <!-------- Import component -------->
    <v-dialog
      v-if="showImport"
      v-model="showImport"
      persistent
      max-width="650px"
    >
      <component-import @action="onImportAction"></component-import>
    </v-dialog>

    <!-------- Main content -------->
    <v-card class="component-model-content" ref="content">
      <!-------- Toolbar -------->
      <component-model-toolbar
        :actions="actions"
        :selectedAction="selectedAction"
        @action="onToolbarAction"
      ></component-model-toolbar>

      <!-------- Model viewer -------->
      <component-model-viewer
        class="component-model-viewer"
        :components="components"
        :componentsLayout="componentsLayout"
        :componentsDisplay="componentsDisplay"
        :componentRoute="currentRoute"
        :mode="viewerMode"
        :action="selectedAction"
        @action="onViewerAction"
        @change="onViewerChange"
      ></component-model-viewer>

      <!-------- Properties panel -------->
      <div class="component-model-propertiesShow">
        <v-btn icon small @click="showProperties = !showProperties">
          <v-icon v-if="showProperties">mdi-chevron-right</v-icon>
          <v-icon v-else>mdi-chevron-left</v-icon>
        </v-btn>
      </div>

      <v-sheet
        v-if="showProperties"
        ref="propertiesPanel"
        elevation="1"
        class="component-model-propertiesPanel"
      >
        <v-toolbar class="component-model-propertiesToolbar" dense>
          <v-icon style="margin-right: 10px" v-if="actionContext.selectedIcon">
            {{ actionContext.selectedIcon }}
          </v-icon>
          <v-toolbar-title>
            {{ componentName }}
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-menu
            v-if="
              actionContext.selectedType &&
              !actionContext.selectedType.endsWith('link') &&
              actionContext.selectedType != 'component'
            "
            offset-y
            :close-on-click="true"
            :close-on-content-click="false"
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                class="mx-2"
                fab
                dark
                width="24"
                height="24"
                v-bind="attrs"
                v-on="on"
                :color="componentColor"
              ></v-btn>
            </template>
            <v-color-picker
              dot-size="25"
              :value="componentColor"
              @input="
                onPropertiesChange({
                  type: 'update',
                  path: '@color',
                  value: $event,
                })
              "
            ></v-color-picker>
          </v-menu>
        </v-toolbar>

        <component-model-properties
          v-if="actionContext.selectedId != null"
          class="component-model-properties"
          :view="propertiesView"
          :model="propertiesModel"
          @change="onPropertiesChange"
        ></component-model-properties>
      </v-sheet>
    </v-card>
  </div>
</template>

<script>
import ComponentModelToolbar from "./ComponentModelToolbar.vue";
import ComponentModelViewer from "./ComponentModelViewer";
import ComponentModelProperties from "./ComponentModelProperties.vue";
import ComponentImport from "./ComponentImport";
import SvgIcon from "./SvgIcon.vue";
import common from "./ComponentModelViewer/common";
import _ from "lodash";
import Clay from "clay.js";
import YAML from 'yaml';

/*_.eachAsync = async (col, fn) => {
    if (col) {
        if (_.isArray(col)) {
            for (let i = 0; i < col.length; i++) await fn(col[i], i);
        } else {
            for (let key in col) await fn(col[key], key);
        }
    }
};*/

export default {
  name: "ComponentModel",
  components: {
    ComponentModelToolbar,
    ComponentModelViewer,
    ComponentModelProperties,
    ComponentImport,
    //SvgIcon
  },

  /* ------------ Component inputs ------------ */
  props: {
    /**
     * The component to explore.
     */
    component: {
      type: Object,
      required: true,
    },
    /**
     * Library of @core components.
     *
    lib: {
      type: Array,
      default: () =>  []
    },*/

    /**
     * Component mode ("read", "write")
     */
    mode: {
      type: String,
    },
  },

  /* ------------ Data properties ------------ */
  data() {
    return {
      /**
       * List of actions available in toolbar.
       */
      actions: [],
      /**
       * Determines the currently selected action in the toolbar.
       * It contains the following meaningful properties: id, name, data
       */
      selectedAction: null,
      /**
       * Data required in the context if each action. When a new action
       * from the toolbar gets selected, the action context is automatically
       * initialized.
       */
      actionContext: {},
      /**
       * Table which contains all the component definitions, addressed
       * by path.
       * The table contains an initial root artificial container at
       * path "". This container includes the root component as a
       * subcomponent. Thus, the real root component will be stored
       * under the "/NAME" path. All subcomponents are then hierarchically
       * registered like "/NAME/YYY".
       * The library of @core components is also stored in this table,
       * under root paths "XXX".
       */
      components: {},

      /**
       * The root component path
       */
      rootPath: "",

      /**
       * Table which contains the layout of all the components
       * included in the "components" property.
       */
      componentsLayout: {},
      /**
       * Table which contains the display of all the components
       * included in the "components" property.
       */
      componentsDisplay: {},
      /**
       * Points to the route of the currently displayed component
       * definition. A route is a sequence of subroutes, where
       * each subroute represents a jumping from the parent composite
       * to an internal subcomponent/connector.
       */
      currentRoute: "",
      /**
       * Determines whether the properties panel must be shown.
       */
      showProperties: true,
      /**
       * Contains the template for displaying the properties of
       * the currently selected component/subcomponent/connector.
       */
      propertiesView: {},
      /**
       * Determines whether the component import dialog should be
       * shown
       */
      showImport: false,
      /**
       * Contains the data required for displaying the properties
       * of the currently selected component/subcomponent/connector.
       */
      propertiesModel: {},
      pathSeparator: common.PATH_SEPARATOR,
      mappingSeparator: ".",
      contentHeight: null,
    };
  },

  /* ------------ Watch properties ------------ */
  watch: {
    mode(value, oldValue) {
      let opts = {
        forceReload: true,
        selectedId: this.actionContext.selectedId,
        selectedType: this.actionContext.selectedType,
      };
      this.navigate(this.currentRoute, opts);
    },
    /*components: {
      deep: true,
      handler(value, old) {
        this.$util.log("ey, cambio:" + JSON.stringify(value));
        // - save file with JSON exported content
        let model = this.exportComponentModel(this.components[this.rootPath]);
        this.$emit("change", { model: model });
      },
    },*/
  },

  /* ----------- Computed properties ----------- */
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      let perms = _.filter(this.component.perms, (perm) =>
        this.$root.user.roles.includes(perm.role)
      );
      if (_.find(perms, (perm) => perm.type == "write" || perm.type == "owner"))
        return "write";
      else return "read";
    },
    /**
     * Obtain the root component.
     */
    root() {
      /*for (let key in this.components[""].subcomponents) {
        return this.components[`${this.$util.constants.PATH_SEPARATOR}${key}`];
      }
      return null;*/
      return this.components[this.rootPath];
    },
    /**
     * Obtains the @name of the component types included in the
     * current route (required for showing the path)
     */
    currentRouteNames() {
      let names = [];
      let route = "";
      let component = this.findComponentByPath("");
      if (component) {
        this.currentRoute
          .split(common.PATH_SEPARATOR)
          .slice(1)
          .forEach((subroute) => {
            component = this.findComponentByRoute(route, subroute);
            names.push(component[`@name`]);
            route += common.PATH_SEPARATOR + subroute;
          });
      }
      return names;
    },
    /**
     * Splits the current route into its component subroutes
     */
    currentSubroutes() {
      return this.currentRoute.split(common.PATH_SEPARATOR);
    },
    /**
     * Obtains the path of the current route.
     * The path can be used to obtain components in the main
     * component table.
     */
    componentPath() {
      return this.route2Path(this.currentRoute);
    },
    /**
     * Determines the mode of the viewer.
     * (required for setting read/write mode)
     */
    viewerMode() {
      if (!this.currentRoute) return "read";
      else if (this.myMode == "read") return "read";
      else if (this.findComponentByPath(this.componentPath)[`@origin`])
        return "read";
      else return "write";
    },
    /**
     * Retrieves the color of the selected component
     * (useful for properties panel)
     */
    componentColor() {
      //this.$util.log(`[ComponentModel] componentColor()`);
      if (this.actionContext.selectedType == "component") {
        let layout = this.componentsLayout[this.route2Path(this.currentRoute)];
        //this.$util.log(`[ComponentModel] componentColor() layout=${JSON.stringify(layout)}`);
        if (layout) return layout.color || common.COLOR_BACKGROUND;
      } else if (this.actionContext.selectedType == "subcomponent") {
        let layout = this.componentsLayout[this.route2Path(this.currentRoute)];
        //this.$util.log(`[ComponentModel] componentColor() layout=${JSON.stringify(layout)}`);
        if (layout && layout.subcomponents) {
          let subcomp = layout.subcomponents.find(
            (subcomp) => subcomp.id == this.actionContext.selectedId
          );
          if (subcomp) return subcomp.color || common.COLOR_BACKGROUND;
        }
      } else if (this.actionContext.selectedType == "connector") {
        let layout = this.componentsLayout[this.route2Path(this.currentRoute)];
        if (layout && layout.connectors) {
          let con = layout.connectors.find(
            (con) => con.id == this.actionContext.selectedId
          );
          if (con) return con.color || common.COLOR_BACKGROUND;
        }
      }
      return common.COLOR_BACKGROUND;
    },
    /**
     * Retrieves the name of the selected component
     * (useful for properties panel)
     */
    componentName() {
      if (this.actionContext.selectedType == "component") {
        return this.findComponentByPath(this.componentPath)[`@name`];
      } else if (this.actionContext.selectedType == "subcomponent") {
        return this.actionContext.selectedChild[`@name`];
      } else if (this.actionContext.selectedType == "connector") {
        return this.actionContext.selectedChild[`@name`];
      } else if (this.actionContext.selectedType == "connector-link") {
        return "Link";
      } else if (this.actionContext.selectedType == "link") {
        return "Link";
      } else {
        return "No component selected";
      }
    },
    /*contentHeight() {
      return this.$refs.container.offsetHeight - this.$refs.toolbar.offsetHeight;
    }*/
  },

  /* ------------- Lifecycle events ------------- */
  created() {
    window.model = this;
    window.common = common;
    window._ = _;

    // - Add root artificial component
    let rootSubcomp = {};
    rootSubcomp[`@id`] = this.component.name;
    rootSubcomp[`@name`] = this.component.name;
    rootSubcomp.type = this.component.name;
    let root = { subcomponents: {} };
    root.subcomponents[rootSubcomp[`@id`]] = rootSubcomp;

    this.rootPath = `${this.$util.constants.PATH_SEPARATOR}${this.component.name}`;

    // - Load current component
    /*await*/ this.loadComponent("", this.component, { props: { "@root": true } });

    // - Load library of @core components
    this.loadLibrary();

    this.$set(this.components, "", {});
    this.makeReactive(this.components[""], root);
    
    this.$nextTick(() => {
      // - Set watches for updates
      this.$watch(
        "components",
        (value, old) => {
          this.$util.log("components CHANGE!!!!" + JSON.stringify(value));
          // - save file with JSON exported content
          //let model = this.exportComponentModel(this.components[this.rootPath]);
          let model = this.exportComponentModel();
          let layout = this.exportComponentLayout();
          this.$emit("change", { model: model, layout: layout });
        },
        { deep: true }
      );

      this.$watch(
        "componentsLayout",
        (value, old) => {
          this.$util.log("layout CHANGE!!!!" + JSON.stringify(value));
          // - save file with JSON exported content
          let model = this.exportComponentModel();
          let layout = this.exportComponentLayout();
          this.$emit("change", { model: model, layout: layout });
        },
        { deep: true }
      );
    });

    // - Load toolbar related to current component
    this.loadToolbar();

    // - Force pointer toolbar action
    this.onToolbarAction("pointer");
  },
  mounted() {
    // - when parent window resizes, we have to redisplay
    let resize = (ev) => {
      this.$util.log(`[ComponentModel] resize(${JSON.stringify(ev)})`);
      this.contentHeight =
        this.$refs.container.offsetHeight -
        /* padding */ 5 -
        this.$refs.toolbar.$el.offsetHeight;
      this.$util.log(
        `[ComponentModel] container=${this.$refs.container.offsetHeight}, toolbar=${this.$refs.toolbar.$el.offsetHeight}, contentHeight=${this.contentHeight}`
      );
      this.$refs.content.$el.style.height = this.contentHeight + "px";
      this.$refs.content.$el.style.maxHeight = this.contentHeight + "px";
    };
    this.clay = new Clay(this.$refs.container);
    this.clay.on("resize", resize);
    resize();
  },
  beforeDestroy() {
    this.$util.log(`[ComponentModel] beforeDestroy()`);
    this.clay.reset();
    delete this.clay;
  },

  /* ---------------- Methods ------------------ */
  methods: {
    /**
     * Handler triggered when the import dialog has finished.
     */
    onImportAction(evt) {
      this.$util.log(`[ComponentModel] onImportAction(${JSON.stringify(evt)})`);
      this.showImport = false;
      if (evt.type == "accept") {
        // - prepare everything so that when the viewer notifies
        //   we can insert the new component
        this.actionContext.selectedComponentType = evt.component;

        // In the viewer we need to select the place where we want to
        // insert the imported component ...
      } else {
        // action cancelled, reset to pointer default action
        this.onToolbarAction("pointer");
      }
    },

    /**
     * Management of subcomponent/component properties change.
     */
    onPropertiesChange(evt) {
      this.$util.log(
        `[ComponentModel] onPropertiesChange(${JSON.stringify(evt)})`
      );

      // - if no selected element then do nothing
      if (!this.actionContext.selectedType) return;

      let subpaths = evt.path.split(this.$util.constants.PATH_SEPARATOR);

      // Get model to operate on (component, subcomponent, connector)
      // - if root then take component type
      // - if component then take component type
      // - if composite subcomponent then take the subcomponent
      // - if writable basic (not @origin) take component type
      // - if connector then take connector
      let model, parentModel;
      let propsModel = this.propertiesModel;
      if (this.componentPath == "") {
        model = this.actionContext.selectedComponentType;
      } else if (this.actionContext.selectedType == "component") {
        model = this.actionContext.selectedComponentType;
      } else if (
        (this.actionContext.selectedType == "subcomponent" &&
          this.actionContext.selectedComponentType.type == "composite") ||
        this.actionContext.selectedType == "connector"
      ) {
        parentModel = this.findComponentByPath(this.componentPath);
        model = this.actionContext.selectedChild;
      } else if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic" &&
        this.actionContext.selectedComponentType[`@origin`]
      ) {
        parentModel = this.findComponentByPath(this.componentPath);
        model = this.actionContext.selectedChild;
      } else if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic"
      ) {
        parentModel = this.findComponentByPath(this.componentPath);
        model = this.actionContext.selectedComponentType;
      }

      // - trick for events
      if (["init", "cfg", "ping", "destroy"].includes(evt.path)) {
        model = this.actionContext.selectedComponentType.events;
      } else {
        // - jump to model property
        for (let i = 0; i < subpaths.length - 1; i++) {
          if (!propsModel[subpaths[i]]) this.$set(propsModel, subpaths[i], {});
          if (!model[subpaths[i]]) this.$set(model, subpaths[i], {});
          parentModel = model;
          model = model[subpaths[i]];
          propsModel = propsModel[subpaths[i]];
        }
      }

      let error;
      switch (evt.type) {
        /******************** Update ********************/
        case "update":
          // Check constraints ....
          //

          // - If @name is updated in a collection, check
          //   uniqueness within its parent
          if (subpaths.length >= 3 && subpaths[2] == `@name`) {
            if (
              _.find(parentModel, (entry) => {
                return (
                  entry[`@name`] == evt.value && entry[`@id`] != model[`@id`]
                );
              })
            ) {
              error = "The name must be unique";
            }
          }

          // - If subcomponent/connector @name then check uniqueness
          //   in both subsets
          if (
            !error &&
            evt.path == `@name` &&
            ["subcomponent", "connector"].includes(
              this.actionContext.selectedType
            )
          ) {
            // - if model is pointing to a child then check uniqueness
            //   in parent
            if (parentModel) {
              let found = false;
              if (
                _.find(
                  parentModel.subcomponents,
                  (subcomp) => subcomp[`@name`] == evt.value
                )
              )
                found = true;
              if (
                _.find(
                  parentModel.connectors,
                  (con) => con[`@name`] == evt.value
                )
              )
                found = true;
              if (found) error = "The name must be unique";
            }
          }

          // if @name is updated in @root or writable basic, then change
          // @name and type in both subcomponent and component type
          if (
            !error &&
            evt.path == `@name` &&
            (this.actionContext.selectedComponentType[`@root`] ||
              (this.actionContext.selectedComponentType.type == "basic" &&
                !this.actionContext.selectedComponentType[`@origin`] &&
                !this.actionContext.selectedComponentType[`@opaque`]))
          ) {
            if (this.actionContext.selectedType == "component") {
              _.each(this.findComponentByPath("").subcomponents, (subcomp) => {
                this.$set(subcomp, `@name`, evt.value);
              });
            } else {
              this.$set(this.actionContext.selectedChild, `@name`, evt.value);
              this.$set(propsModel, "type", evt.value);
            }
            this.$set(
              this.actionContext.selectedComponentType,
              `@name`,
              evt.value
            );
          }

          // if @published is updated in connector
          if (!error && evt.path == `@published`) {
            // - update parent endpoints mapping
            let container = this.findComponentByPath(this.componentPath);
            if (evt.value) {
              // add new endpoint to parent
              // - generate unique name
              let epName = this.uniqueName(
                this.actionContext.selectedChild[`@name`],
                container.endpoints
              );
              let epId = this.uuid();
              this.$set(container.endpoints, epId, {});
              this.$set(container.endpoints[epId], `@id`, epId);
              this.$set(container.endpoints[epId], `@name`, epName);
              this.$set(container.endpoints[epId], "type", "in");
              this.$set(
                container.endpoints[epId],
                "mapping",
                this.actionContext.selectedChild[`@id`]
              );
              this.$set(propsModel, `@published`, evt.value);
              this.$set(propsModel, `@referrerName`, epName);
              this.$set(propsModel, `@referrerId`, epId);

              // Look for connected peers, to set protocol/required
              let [subcomp, subcompEp] =
                this.actionContext.selectedChild.outputs[0].split(".");

              let peerType = this.findComponentByPath(
                this.componentPath,
                container.subcomponents[subcomp].type
              );
              this.$set(
                container.endpoints[epId],
                "protocol",
                peerType.endpoints[subcompEp].protocol
              );
              this.$set(
                container.endpoints[epId],
                "required",
                peerType.endpoints[subcompEp].required
              );
            } else {
              // remove endpoint from parent and all attached links
              let containerEp = _.find(container.endpoints, (ep, epId) => {
                let [subcomp, subcompEp] = ep.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                return (
                  !subcompEp &&
                  subcomp == this.actionContext.selectedChild[`@id`]
                );
              });
              if (containerEp) {
                this.$delete(container.endpoints, containerEp[`@id`]);
                // - look for all connected links
                if (!container[`@root`]) {
                  let parent = this.findComponentByRoute(
                    this.parentRoute(this.currentRoute)
                  );
                  // - look for subcomponents of the given type
                  let mappings = [];
                  _.each(parent.subcomponents, (subcomp, subcompId) => {
                    if (subcomp.type == container[`@id`])
                      mappings.push(
                        `${subcomp[`@id`]}${
                          this.$util.constants.MAPPING_SEPARATOR
                        }${containerEp[`@id`]}`
                      );
                  });
                  _.each(parent.connectors, (con, conId) => {
                    // - look for links to subcomponents
                    let index,
                      removed = false;
                    do {
                      index = _.findIndex(con.outputs, (output) =>
                        mappings.includes(output)
                      );
                      if (index != -1) {
                        con.outputs.splice(index, 1);
                        removed = true;
                      }
                    } while (index != -1);
                    if (removed && con.type == "Link")
                      this.$delete(parent.connectors, conId);
                  });
                }
              }
              this.$delete(propsModel, `@published`);
              this.$delete(propsModel, `@referrerName`);
              this.$delete(propsModel, `@referrerId`);
            }
          }

          // if @referrerName is updated in connector
          if (!error && evt.path == `@referrerName`) {
            let container = this.findComponentByPath(this.componentPath);
            let containerEp = _.find(container.endpoints, (ep, epId) => {
              let [subcomp, subcompEp] = ep.mapping.split(
                this.$util.constants.MAPPING_SEPARATOR
              );
              return (
                !subcompEp && subcomp == this.actionContext.selectedChild[`@id`]
              );
            });
            if (containerEp) {
              // - check @name uniqueness
              let otherEp = _.find(
                container.endpoints,
                (ep) => ep[`@name`] == evt.value
              );
              if (otherEp && otherEp != containerEp)
                error = "The name must be unique";
              else {
                this.$set(containerEp, `@name`, evt.value);
                this.$set(propsModel, `@referrerName`, evt.value);
              }
            }
          }

          // if @color is updated then update child
          if (!error && evt.path == `@color`) {
            if (this.componentPath == "") {
              this.$set(
                this.actionContext.selectedComponentType,
                `@color`,
                evt.value
              );
              this.$set(this.actionContext.selectedChild, `@color`, evt.value);
            } else if (
              ["subcomponent", "connector"].includes(
                this.actionContext.selectedType
              )
            )
              this.$set(this.actionContext.selectedChild, `@color`, evt.value);
            else if (this.actionContext.selectedType == "component")
              this.$set(
                this.actionContext.selectedComponentType,
                `@color`,
                evt.value
              );
            return;
          }

          // - If cardinality, durability on component then check subcomponent
          //
          if (
            !error &&
            this.actionContext.selectedId == "" &&
            (subpaths[0] == "durability" || subpaths[0] == "cardinality")
          ) {
            if (evt.value) {
              // - go to every subcomponent/connector referencing and
              //   reset
              let parent = this.findComponentByRoute(
                this.parentRoute(this.currentRoute)
              );
              _.forEach(parent.subcomponents, (subcomp) => {
                if (subcomp[subpaths[0]]) subcomp[subpaths[0]] = "";
              });
              _.forEach(parent.connectors, (con) => {
                if (con[subpaths[0]]) con[subpaths[0]] = "";
              });
            }
          }

          // - Propagate endpoint type/required/protocol modification
          //
          if (
            !error &&
            subpaths[0] == "endpoints" &&
            (subpaths[2] == "type" ||
              subpaths[2] == "required" ||
              subpaths[2] == "protocol")
          ) {
            this.setOnCascade(
              this.route(this.currentRoute, this.actionContext.selectedId),
              `${subpaths[0]}/${subpaths[1]}/${subpaths[2]}`,
              evt.value
            );
          }

          // - [TODO] Propagate to published incoming endpoints all the way up
          // ¿?¿?¿¿¿?¿?¿?¿

          // - Check collections @published
          //
          if (
            !error &&
            ["variables", "endpoints", "volumes"].includes(subpaths[0]) &&
            subpaths[2] == `@published`
          ) {
            // - check @published
            //

            if (evt.value) {
              // - new published entry!
              let component = this.findComponentByPath(this.componentPath);
              // - look for new name
              let entryName = this.uniqueName(
                this.actionContext.selectedComponentType[subpaths[0]][
                  subpaths[1]
                ][`@name`],
                component[subpaths[0]]
              );

              // - modify container composite
              let entryId = this.uuid();
              this.$set(component[subpaths[0]], entryId, {});
              this.$set(component[subpaths[0]][entryId], `@id`, entryId);
              this.$set(component[subpaths[0]][entryId], `@name`, entryName);
              this.$set(
                component[subpaths[0]][entryId],
                `mapping`,
                `${this.actionContext.selectedId}${
                  this.$util.constants.MAPPING_SEPARATOR
                }${
                  this.actionContext.selectedComponentType[subpaths[0]][
                    subpaths[1]
                  ][`@id`]
                }`
              );

              // - if endpoint propagate type,required,protocol too
              if (subpaths[0] == "endpoints") {
                this.$set(
                  component[subpaths[0]][entryId],
                  `type`,
                  model[`type`]
                );
                this.$set(
                  component[subpaths[0]][entryId],
                  `required`,
                  model[`required`]
                );
                this.$set(
                  component[subpaths[0]][entryId],
                  `protocol`,
                  model[`protocol`]
                );
              }

              this.$set(propsModel, `@referrerName`, entryName);
              this.$set(propsModel, `@referrerId`, entryId);
              this.$set(propsModel, `@icon`, `mdi-eye-outline`);
            } else {
              // - unpublish entry
              //
              /*this.$delete(
                  this.components[this.componentPath][subpaths[0]],
                  propsModel[`@referrerId`]
                );*/
              this.$delete(propsModel, `@referrerName`);
              this.$delete(propsModel, `@referrerId`);
              this.$delete(propsModel, `@icon`);

              // - recursive unpublish up in the hierarchy
              //
              this.removeOnCascade(
                this.route(this.currentRoute, this.actionContext.selectedId),
                `${subpaths[0]}/${subpaths[1]}`
              );
            }
          }

          // - Check collections @referrerName
          //
          if (
            !error &&
            (subpaths[0] == "variables" ||
              subpaths[0] == "endpoints" ||
              subpaths[0] == "volumes") &&
            subpaths[2] == `@referrerName`
          ) {
            // - check @referrerName
            //

            // - check uniqueness in container composite
            if (
              _.find(
                this.findComponentByPath(this.componentPath)[subpaths[0]],
                (entry) => entry[`@name`] == evt.value
              )
            ) {
              this.$set(
                propsModel,
                `@referrerNameError`,
                "The name must be unique. Conflict in container composite found."
              );
              error = true;
            } else {
              // - modify container composite
              this.$set(
                this.findComponentByPath(this.componentPath)[subpaths[0]][
                  propsModel[`@referrerId`]
                ],
                `@name`,
                evt.value
              );
              this.$delete(propsModel, `@referrerNameError`);
            }
          }

          // ------------- trick for vars
          if (
            !error &&
            subpaths[0] == "variables" &&
            this.componentPath != "" &&
            this.actionContext.selectedType == "subcomponent" &&
            this.actionContext.selectedComponentType.type == "basic" &&
            !this.actionContext.selectedComponentType[`@origin`]
          ) {
            this.$set(
              this.actionContext.selectedChild.variables[subpaths[1]],
              subpaths[2],
              evt.value
            );
            if (subpaths[2] == "value") return; // no modification on  type
          }

          if (error) {
            if (_.isString(error))
              this.$set(propsModel, `${evt.path}Error`, error);
          } else {
            this.$delete(propsModel, `${evt.path}Error`);
            this.$set(model, subpaths[subpaths.length - 1], evt.value);
            this.$set(propsModel, subpaths[subpaths.length - 1], evt.value);
            this.$set(propsModel, "@nameError", null);
          }
          break;

        /******************** Add ********************/
        case "add":
          if (typeof evt.value == "object") {
            let id = this.uuid();

            // - overwrite @name to guarantee uniqueness
            if (evt.value[`@name`]) {
              /* let i = 0;
              let name = evt.value[`@name`];
              while (
                _.find(
                  model[subpaths[subpaths.length - 1]],
                  (entry) => entry[`@name`] == name
                )
              ) {
                i++;
                name = `${evt.value[`@name`]}_${i}`;
              }*/
              evt.value[`@name`] = this.uniqueName(
                evt.value[`@name`],
                model[subpaths[subpaths.length - 1]]
              );
            }

            this.$set(model[subpaths[subpaths.length - 1]], id, {});
            this.$set(model[subpaths[subpaths.length - 1]][id], `@id`, id);
            this.$set(propsModel[subpaths[subpaths.length - 1]], id, {});
            this.$set(propsModel[subpaths[subpaths.length - 1]][id], `@id`, id);
            _.each(evt.value, (val, prop) => {
              this.$set(model[subpaths[subpaths.length - 1]][id], prop, val);
              this.$set(
                propsModel[subpaths[subpaths.length - 1]][id],
                prop,
                val
              );
            });

            // ------ trick for vars
            if (
              subpaths[0] == "variables" &&
              this.actionContext.selectedType == "subcomponent" &&
              this.actionContext.selectedComponentType.type == "basic" &&
              !this.actionContext.selectedComponentType[`@origin`]
            ) {
              this.$set(model[subpaths[subpaths.length - 1]][id], "value", "");
              let vars = this.actionContext.selectedChild.variables;
              this.$set(vars, id, {});
              this.$set(vars[id], `@id`, id);
              _.each(evt.value, (val, prop) => {
                this.$set(vars[id], prop, val);
              });
            }

            // - activate section
            this.$set(this.propertiesView, "active", `${subpaths[0]}/${id}`);
            // - scroll to section
            setTimeout(() => {
              let element = document.getElementById(`${subpaths[0]}/${id}`);
              if (element)
                this.$refs.propertiesPanel.$el.scrollTo(
                  0,
                  element.offsetTop - 100 /* toolbar */
                );
            }, 100);
          } else {
            this.$set(
              model[subpaths[subpaths.length - 1]],
              this.uuid(),
              evt.value
            );
            this.$set(
              propsModel[subpaths[subpaths.length - 1]],
              this.uuid(),
              evt.value
            );
          }
          break;

        /******************** Remove ********************/
        case "remove": {
          // if 'remove' is triggered then we can ensure the
          // subcomponent has been selected and it is embedded
          // (writable)
          //
          this.$delete(model, subpaths[subpaths.length - 1]);
          this.$delete(propsModel, subpaths[subpaths.length - 1]);

          // ------ trick for vars
          if (
            subpaths[0] == "variables" &&
            this.actionContext.selectedType == "subcomponent" &&
            this.actionContext.selectedComponentType.type == "basic" &&
            !this.actionContext.selectedComponentType[`@origin`]
          ) {
            let vars = this.actionContext.selectedChild.variables;
            this.$delete(vars, subpaths[subpaths.length - 1]);
          }

          // if published in container, then remove from container
          // recursively ...
          //
          this.removeOnCascade(
            this.route(this.currentRoute, this.actionContext.selectedId),
            `${subpaths[0]}/${subpaths[1]}`
          );

          break;
        }
        case "action":
          {
            if (evt.value == "jumpToReferred") {
              // assert(subpaths[3] == `@name`)
              // jump down to definition
              if (this.actionContext.selectedId == "") {
                // container selected, jump to internal subcomponent
                let [subcompId, id] = model.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                this.navigate(this.currentRoute, {
                  selectedType: "subcomponent",
                  selectedId: subcompId,
                  selectedSubpath: `${subpaths[0]}/${id}`,
                });
              } else {
                // here we have to move harder, we change both component type
                // and subcomponentId
                let [subcompId, id] = model.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                let route = this.route(
                  this.current,
                  this.actionContext.selectedId
                );
                this.navigate(route, {
                  selectedType: "subcomponent",
                  selectedId: subcompId,
                  selectedSubpath: `${subpaths[0]}/${id}`,
                });
              }
            } else if (evt.value == "jumpToReferrer") {
              // assert(subpaths[3] == `@referrerName`)
              // jump up to published
              this.navigate(this.currentRoute, {
                selectedType: "component",
                selectedId: "",
                selectedSubpath: `${subpaths[0]}/${propsModel[`@referrerId`]}`,
              });
            } else if (evt.value == "restoreReferred") {
              // restore original value means delete

              let inheritedProp;
              if (this.actionContext.selectedType == "component") {
                // - if the container is selected
                //
                let [subcompId, id] = model.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                inheritedProp = this.getOnCascade(
                  this.route(this.currentRoute, subcompId),
                  `${subpaths[0]}/${id}/${subpaths[2]}`
                );
              } else {
                inheritedProp = this.getOnCascade(
                  this.route(this.currentRoute, this.actionContext.selectedId),
                  `${subpaths[0]}/${subpaths[1]}/${subpaths[2]}`,
                  { startFromComponent: true }
                );
              }
              //this.$set(model, subpaths[2], inheritedProp.value);
              this.$delete(model, subpaths[2]);
              this.$set(propsModel, subpaths[2], inheritedProp.value);
            }
          }
          break;
        default:
      }
    },
    created() {
      this.$util.log(`[ComponentModel] created()`);
    },
    onViewerChange(evt) {
      this.$util.log(`[ComponentModel] onViewerChange(${JSON.stringify(evt)})`);
      if (evt.type == "layout") {
        // If layout change then overwrite with new layout
        this.$set(this.componentsLayout, this.componentPath, evt.value);
      }
    },

    /**
     * Handler triggered when an action is performed on the viewer.
     *
     * @param {Object} evt - Event data
     * @param {string} evt.type - The event type
     */
    /*async*/ onViewerAction(evt) {
      this.$util.log(`[ComponentModel] onViewerAction(${JSON.stringify(evt)})`);
      //switch (this.selectedAction.name) {
      switch (evt.type) {
        case "select":
          // the selection on the diagram has changed
          //

          if (!evt.selectedType) {
            // - nothing has been selected in the viewer
            if (this.componentPath == "") {
              // - no container to select, we are in the root: deselect
              this.navigate(this.currentRoute);
            } else {
              // - select container
              this.navigate(this.currentRoute, {
                selectedType: "component",
                selectedId: "",
              });
            }
          } else if (
            evt.selectedType == "basic" ||
            evt.selectedType == "composite"
          ) {
            // - if subcomponent is selected
            this.$util.log("subcomponent selected");
            this.navigate(this.currentRoute, {
              selectedType: "subcomponent",
              selectedId: evt.selectedId,
              selectedPath: evt.selectedPath,
            });
          } else if (evt.selectedType == "connector") {
            // - if connector is selected
            this.navigate(this.currentRoute, {
              selectedType: "connector",
              selectedId: evt.selectedId,
              selectedPath: evt.selectedPath,
            });
          } else if (evt.selectedType == "connector-link") {
            // - if "link" connector has been selected
            this.navigate(this.currentRoute, {
              selectedType: "connector-link",
              selectedId: evt.selectedId,
            });
          } else if (evt.selectedType == "link") {
            let source = evt.source.endpoint
              ? { subcomponent: evt.source.id, endpoint: evt.source.endpoint }
              : evt.source.id;
            let target = evt.target.endpoint
              ? { subcomponent: evt.target.id, endpoint: evt.target.endpoint }
              : evt.target.id;
            // - if connector->component link has been selected
            this.navigate(this.currentRoute, {
              selectedType: "link",
              selectedData: {
                source: source,
                target: target,
              },
            });
          }
          break;
        case "dblclick": {
          if (evt.selectedType == "composite") {
            let route = this.route(this.currentRoute, evt.selectedId);
            if (this.findComponentByRoute(route).type == "composite") {
              this.navigate(route);
            }
          }
          break;
        }
        case "zoomIn":
        case "zoomOut":
        case "zoomFit":
          this.onToolbarAction("pointer");
          break;
        case "addComponent":
        case "addComposite":
        case "addRecursive": {
          let type;
          if (this.selectedAction.name == "addComponent") type = "basic";
          else if (this.selectedAction.name == "addComposite")
            type = "composite";
          else if (this.selectedAction.name == "addRecursive") type = ".";
          this.addSubcomponent({ type: type, layout: evt.layout });
          this.onToolbarAction("pointer");
          break;
        }
        case "addConnector": {
          let con = this.addConnector({
            type: this.selectedAction.data,
            layout: evt.layout,
          });
          if (evt.src) {
            // the connector must connect to source
            let [src, srcEp] = evt.src.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            this.addLink({ subcomponent: src, endpoint: srcEp }, con[`@id`]);
          }
          if (evt.dst) {
            // the connector must connect to destination
            let [dst, dstEp] = evt.dst.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            this.addLink(con[`@id`], { subcomponent: dst, endpoint: dstEp });
          }
          this.onToolbarAction("pointer");
          break;
        }
        case "addLink": {
          // - a new link has been added, there are 3 possibilities:
          //   component -> component, component -> connector, connector -> component
          let [src, srcEp] = evt.src.split(
            this.$util.constants.MAPPING_SEPARATOR
          );
          let [dst, dstEp] = evt.dst.split(
            this.$util.constants.MAPPING_SEPARATOR
          );

          if (srcEp && dstEp) {
            // - case component -> component
            //   we add the new connector and then we insert
            //   links
            let con = this.addConnector({ type: "Link" });
            this.addLink({ subcomponent: src, endpoint: srcEp }, con[`@id`]);
            this.addLink(
              con[`@id`],
              { subcomponent: dst, endpoint: dstEp },
              con[`@id`]
            );
          } else if (srcEp && !dstEp) {
            // - case component -> connector
            this.addLink({ subcomponent: src, endpoint: srcEp }, dst);
          } else if (!srcEp && dstEp) {
            // - case connector -> component
            this.addLink(src, { subcomponent: dst, endpoint: dstEp });
          }
          this.onToolbarAction("pointer");

          break;
        }
        /* diagram menu actions */
        case "addVariable":
          // - add new variable to component
          this.onPropertiesChange({
            type: "add",
            path: "variables",
            value: { "@name": "VARIABLE", value: "" },
          });
          break;
        case "addEndpoint":
          this.onPropertiesChange({
            type: "add",
            path: "endpoints",
            value: {
              "@name": "endpoint",
              type: "in",
              protocol: "http",
              required: false,
            },
          });
          break;
        case "addVolume":
          this.onPropertiesChange({
            type: "add",
            path: "volumes",
            value: {
              "@name": "volume",
              type: "local",
              path: "/volume",
              scope: "",
              durability: "",
            },
          });
          break;
        case "remove":
          // - remove selected subcomponent/connector
          if (this.actionContext.selectedType == "subcomponent") {
            this.removeSubcomponent(this.actionContext.selectedId);
          } else if (this.actionContext.selectedType == "connector") {
            this.removeConnector(this.actionContext.selectedId);
          } else if (this.actionContext.selectedType == "connector-link") {
            this.removeConnector(this.actionContext.selectedId);
          } else if (this.actionContext.selectedType == "link") {
            this.removeLink(
              this.actionContext.selectedData.source,
              this.actionContext.selectedData.target
            );
          }
          this.$delete(this.selectedAction, "selectedId");
          this.$delete(this.selectedAction, "menu");
          this.actionContext.selectedType = null;
          this.actionContext.selectedId = null;
          this.actionContext.selectedChild = null;
          this.actionContext.selectedComponentType = null;
          this.actionContext.selectedIcon = null;
          break;
        case "open": {
          let route = this.route(
            this.currentRoute,
            this.actionContext.selectedId
          );
          if (this.findComponentByRoute(route).type == "composite") {
            this.navigate(route);
          }
          break;
        }
        case "export": {
          // - save file with JSON exported content
          let model = this.findComponentByRoute(
              this.currentRoute,
              this.actionContext.selectedId
            );
          let exportedModel = this.exportComponentModel(model);
          var element = document.createElement("a");
          element.setAttribute(
            "href",
            "data:text/plain;charset=utf-8," +
              encodeURIComponent(YAML.stringify(exportedModel))
             /*encodeURIComponent(JSON.stringify(exportedModel))*/
          );
          element.setAttribute("download", `${model['@name']}.model`);

          element.style.display = "none";
          document.body.appendChild(element);

          element.click();

          document.body.removeChild(element);
          break;
        }
        case "importComponent": {
          // - generate component identifier to avoid name collisions
          let componentType,
            componentId = this.uuid();
          if (this.actionContext.selectedComponentType.model) {
            // we have a component, load component
            componentType = /*await*/ this.loadComponent(
              this.componentPath,
              this.actionContext.selectedComponentType,
              { name: componentId }
            );
          } else {
            // we have a model, load model
            componentType = /*await*/ this.loadComponentModel(
              `${this.componentPath}${this.$util.constants.PATH_SEPARATOR}${componentId}`,
              this.actionContext.selectedComponentType
            );
          }
          // - avoid @name collisions ...
          let container = this.findComponentByPath(this.componentPath);
          let componentName = this.uniqueName(
            componentType[`@name`] || "Imported",
            _.map(
              container.imports,
              (type) =>
                this.findComponentByPath(this.componentPath, type)[`@name`]
            )
          );
          this.$set(componentType, `@name`, componentName);

          this.addSubcomponent({ type: componentId, layout: evt.layout });
          this.onToolbarAction("pointer");
          break;
        }
        case "importConnector": {
          // - generate component identifier to avoid name collisions
          let componentType,
            connectorId = this.uuid();
          if (this.actionContext.selectedComponentType.model) {
            // we have a component, load component
            componentType = /*await*/ this.loadComponent(
              this.componentPath,
              this.actionContext.selectedComponentType,
              { name: connectorId }
            );
          } else {
            // we have a model, load model
            componentType =/*await*/ this.loadComponentModel(
              `${this.componentPath}${this.$util.constants.PATH_SEPARATOR}${connectorId}`,
              this.actionContext.selectedComponentType
            );
          }
          // - avoid @name collisions ...
          let container = this.findComponentByPath(this.componentPath);
          let connectorName = this.uniqueName(
            componentType[`@name`] || "Imported",
            _.map(
              container.imports,
              (type) =>
                this.findComponentByPath(this.componentPath, type)[`@name`]
            )
          );
          this.$set(componentType, `@name`, connectorName);
          let con = this.addConnector({
            type: connectorId,
            layout: evt.layout,
          });
          if (evt.src) {
            // the connector must connect to source
            let [src, srcEp] = evt.src.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            this.addLink({ subcomponent: src, endpoint: srcEp }, con[`@id`]);
          }
          if (evt.dst) {
            // the connector must connect to destination
            let [dst, dstEp] = evt.dst.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            this.addLink(con[`@id`], { subcomponent: dst, endpoint: dstEp });
          }
          this.onToolbarAction("pointer");
          break;
        }
        default:
      }
    },

    /**
     * Load the library of @core components.
     */
    async loadLibrary() {
      this.$util.log(`[ComponentModel] loadLibrary()`);

      let coreComponents = await this.$model.listComponents(
        this.$root.user.token,
        { labels: { $any: ["tag=@core"] } }
      );

      // - add obligatory Link component type
      /*coreComponents.unshift({
        name: "Link",
        tags: ["@core", "@connector"],
        data: JSON.stringify({ "@icon": "mdi-arrow-right " }),
        model: JSON.stringify({
          type: "basic",
          name: "Link",
        }),
      });*/

      // - clean previously registered SvgIcons
      _.each(this.$vuetify.icons.values, (val, key) => {
        if (key.startsWith("@ks_")) {
          delete this.$vuetify.icons.values[key];
        }
      });

      // - load each @core component as @opaque
      /*await*/ _.each(coreComponents, /*async*/ (comp) => {
        // - parse model
        //let model = JSON.parse(comp.model);
        let model = comp.model;

        // - obtain tags
        let tags = _.map(
          _.filter(comp.labels, (label) => label.startsWith("tag=")),
          (label) => {
            let [name, tag] = label.split("=");
            return tag;
          }
        );

        // - add special properties
        let re = new RegExp("<(.*)>.*?|<(.*) />");
        let props = {
          "@core": true,
          "@opaque": true,
          "@component": tags.includes("@component"),
          "@connector": tags.includes("@connector"),
        };
        if (tags.includes("@component")) props["@component"] = true;
        if (tags.includes("@connector")) props["@connector"] = true;

        // - get icon
        let icon = _.find(comp.labels, (label) => label.startsWith("@icon="));
        if (icon) {
          let [name, data] = icon.split("=");
          let uuid = this.uuid();

          if (re.test(data)) {
            // - if the icon specification contains <svg> then
            //   register SvgIcon component
            this.$vuetify.icons.values[`@ks_${uuid}`] = {
              component: SvgIcon,
              props: { content: data },
            };
          } else this.$vuetify.icons.values[`@ks_${uuid}`] = data;
          props[`@icon`] = `@ks_${uuid}`;
        }

        /*await*/ this.loadComponentModel(
          /*`${this.$util.constants.PATH_SEPARATOR}${comp.name}`,*/
          comp.name,
          model,
          { props: props }
        );
      });
    },

    /**
     * Loads the specified component under the specified path.
     * By default the component name is taken for registering the component path.
     *
     * @param {string} path - The component path
     * @param {Object} component - The component to load
     * @param {Object} [opts] - Additional options
     * @param {string} [opts.name] - The component name
     * @param {Object} [opts.props] - Additional properties to register in loaded component
     */
    /*async*/ loadComponent(path, component, opts) {
      this.$util.log(
        `[ComponentModel] loadComponent(${path}, ${JSON.stringify(opts)})`
      );

      // Load and expand the model together with all its dependencies

      // - get layout
      /*let _layout = this.component.layout
        ? JSON.parse(this.component.layout)
        : {};*/
      let _layout = component.layout || {};

      // - adapt layout
      let layout = {};
      _.each(_layout, (entry, entryPath) => {
        // - replace name
        entryPath = opts.name
          ? entryPath.replace(`/${component.name}`, `/${opts.name}`)
          : entryPath;
        layout[`${path}${entryPath}`] = entry;
      });

      // - make layout reactive
      this.makeReactive(this.componentsLayout, layout);

      // - get model
      //let model = component.model ? JSON.parse(component.model) : null;
      let model = component.model;

      if (!model) {
        // - define default empty model
        model = {
          name: "Default",
          type: component.type,
        };
      }

      // - register artificial root entry containing a pointer to the component
      /*this.$set(this.components, "", {});

      let artificialRoot = { subcomponents: {} };
      let artificialRootSubcomponent = {};
      artificialRootSubcomponent[`@id`] = this.component.name;
      artificialRootSubcomponent[`@name`] = this.component.name;
      artificialRootSubcomponent.type = this.component.name;
      artificialRoot.subcomponents[
        this.component.name
      ] = artificialRootSubcomponent;

      // - make reactive
      this.makeReactive(this.components[""], artificialRoot);*/

      // - load all components
      let componentType = /*await*/ this.loadComponentModel(
        `${path}${this.$util.constants.PATH_SEPARATOR}${
          opts.name || component.name
        }`,
        model,
        opts
      );
      return componentType;
    },

    /**
     * Loads the specified component under the specified path.
     *
     * This means fetching the component if it has not been fetched before,
     * and loading all embedded components, if it is a composite.
     *
     * @param {string} path - The component path
     * @param {string|Object} spec - The component spec
     * @param {Object} [opts] - Additional options
     * @param {boolean} [opts.origin] - The specified component has a remote origin
     * @param {Object} [opts.props] - Additonal properties to register in loaded component
     * @param {boolean} [opts.lazy] - Do not fetch remote specs recursively
     * @return {Object} The loaded component spec
     */
    /*async*/ loadComponentModel(path, spec, opts) {
      this.$util.log(
        `[ComponentModel] loadComponentModel(${path},${JSON.stringify(spec)})`
      );
      opts = opts || {};
      // - if the spec is a remote url then download
      if (_.isString(spec)) {
        spec = /*await*/ this.fetchComponent(spec);
      }
      // - if the spec is a composite then load imports first
      if (spec.type == "composite") {
        /*if (spec.imports) {
          for (let name in spec.imports) {
            let imported = await this.loadComponentModel(
              `${path}${this.$util.constants.PATH_SEPARATOR}${name}`,
              spec.imports[name],
              { origin: spec[`@origin`] || opts.origin }
            );
          }
        }*/
        /*await*/ _.each(spec.imports, /*async*/ (subspec, name) => {
          let imported = /*await*/ this.loadComponentModel(
            `${path}${this.$util.constants.PATH_SEPARATOR}${name}`,
            subspec,
            { origin: spec[`@origin`] || opts.origin }
          );
        });
        spec.imports = _.map(spec.imports, (val, key) => key);
      }

      // Adapt component
      if (opts.origin) spec[`@origin`] = opts.origin;
      if (opts.props) Object.assign(spec, opts.props);

      // - add @path, @name
      //spec[this.prefixSpecialProperty + "path"] = path;
      spec[`@id`] = path;
      spec[`@name`] = spec.name;

      // - normalize properties
      if (spec.type == "basic") {
        spec.runtime = spec.runtime || "docker";
        spec.source = spec.source || "";
        spec.schedule = spec.schedule || "";
        spec.cardinality = spec.cardinality || ""; // overwritable
        spec.durability = spec.durability || ""; // overwritable
        spec.events = spec.events || {};
        spec.events.init = spec.events.init || "";
        spec.events.cfg = spec.events.cfg || "";
        spec.events.ping = spec.events.ping || "";
        spec.events.destroy = spec.events.destroy || "";
      } else if (spec.type == "composite") {
        spec.cardinality = spec.cardinality || ""; // overwritable
        spec.schedule = spec.schedule || "";
        //spec.durability = spec.durability || ""; // overwritable
        // - subcomponents
        spec.subcomponents = spec.subcomponents || {};
        _.each(spec.subcomponents, (subcomp, id) => {
          if (_.isString(subcomp)) {
            subcomp = { type: subcomp };
          }
          subcomp[`@id`] = id;
          subcomp[`@name`] = id;
          subcomp.variables = subcomp.variables || {};
          _.each(subcomp.variables, (variable, id) => {
            if (_.isString(variable)) {
              variable = { value: variable };
              subcomp.variables[id] = variable;
            }
            variable[`@id`] = id;
            variable[`@name`] = id;
          });
          subcomp.volumes = subcomp.volumes || {};
          _.each(subcomp.volumes, (vol, id) => {
            vol[`@id`] = id;
            vol[`@name`] = id;
          });
          spec.subcomponents[id] = subcomp;
        });
        spec.connectors = spec.connectors || {};
        _.each(spec.connectors, (con, id) => {
          con[`@id`] = id;
          con[`@name`] = id;
          con.variables = con.variables || {};
          _.each(con.variables, (variable, id) => {
            if (_.isString(variable)) {
              variable = { value: variable };
              con.variables[id] = variable;
            }
            variable[`@id`] = id;
            variable[`@name`] = id;
          });
          con.volumes = con.volumes || {};
          _.each(con.volumes, (vol, id) => {
            vol[`@id`] = id;
            vol[`@name`] = id;
          });
          con.inputs = con.inputs || [];
          con.outputs = con.outputs || [];
        });
      }

      // - variables
      spec.variables = spec.variables || {};
      _.each(spec.variables, (variable, id) => {
        /*if (_.isString(variable)) {
          variable = { value: variable };
          spec.variables[id] = variable;
        }*/
        variable = { value: String(variable) };
        spec.variables[id] = variable;
        variable[`@id`] = id;
        variable[`@name`] = id;
      });

      // - volumes
      spec.volumes = spec.volumes || {};
      _.each(spec.volumes, (vol, id) => {
        vol[`@id`] = id;
        vol[`@name`] = id;
        vol[`scope`] = vol[`scope`] || "";
        vol[`durability`] = vol[`durability`] || "";
        vol[`url`] = vol[`url`] || "";
      });

      // - endpoints
      spec.endpoints = spec.endpoints || {};
      _.each(spec.endpoints, (endpoint, id) => {
        endpoint[`@id`] = id;
        endpoint[`@name`] = id;
      });

      // - make reactive
      this.$set(this.components, path, {});
      this.makeReactive(this.components[path], spec);

      return spec;
    },

    /**
     * Fetches a component description given a URL.
     *
     * The following URL types are supposed to be currently supported:
     * - regular URL which references a JSON file with a component description.
     * - URL which references a concrete diagram/version within the Komponents
     *   platform
     *
     * Currently every URL is processed in the same way: an access token is added
     * to the HTTP request and the retrieved resource is analyzed. If it contains a
     * 'model' field then a diagram is assumed, otherwise a plain JSON description
     * is considered.
     *
     * @param {string} url - The component URL
     */
    /*async*/ fetchComponent(url) {
      this.$util.log(`[ComponentModel] fetchComponent(${url})`);

      // [TODO] Load remote component

      // [TODO] Load remote component layout

      /*let theURL = new URL(url);
      theURL.searchParams.append('token', this.$root.user.token);
      let resp = JSON.parse(await axios.get(theURL.toString()));
      if (resp.model) {
        let comp = JSON.parse(resp.model);
        if (resp.layout) comp[this.prefixSpecialProperty + 'layout'] = JSON.parse(resp.layout);
        comp[this.prefixSpecialProperty + 'origin'] = url;
        return comp;
      } else throw new Error('Received response is not a )
      */
    },

    /**
     * Exports the model of the specified component.
     *
     * @param {string|Object} [component] - The component path, or the component to export.
     *                                      If not specified the root is taken.
     * @return {Object} The exported component model
     */
    exportComponentModel(component) {
      this.$util.log(
        `[ComponentModel] exportComponentModel(${
          component && _.isString(component)
            ? component
            : component && component[`@id`]
        })`
      );
      if (!component) component = this.components[this.rootPath];
      if (_.isString(component))
        component = this.findComponentByPath(component);
      let model = {};
      model.type = component.type;
      model.name = component[`@name`];
      if (component.type == "basic") {
        // ----------- basic
        model.runtime = component.runtime;
        model.source = component.source;
        model.cardinality = component.cardinality;
        model.durability = component.durability;

        // - variables
        if (component.variables) {
          model.variables = {};
          _.each(component.variables, (_variable, id) => {
            model.variables[_variable[`@name`]] = _variable.value;
          });
        }
        // - volumes
        if (component.volumes) {
          model.volumes = {};
          _.each(component.volumes, (_vol, id) => {
            let vol = {};
            if (_vol.type) vol.type = _vol.type;
            if (_vol.scope) vol.scope = _vol.scope;
            if (_vol.durability) vol.durability = _vol.durability;
            if (_vol.url) vol.url = _vol.url;
            model.volumes[_vol[`@name`]] = vol;
          });
        }
        // - endpoints
        if (component.endpoints) {
          model.endpoints = {};
          _.each(component.endpoints, (_ep, id) => {
            let ep = {};
            if (_ep.type) ep.type = _ep.type;
            if (_ep.protocol) ep.protocol = _ep.protocol;
            if (_ep.required) ep.required = _ep.required;
            model.endpoints[_ep[`@name`]] = ep;
          });
        }

        // - events
        if (component.events) {
          model.events = {};
          _.each(component.events, (ev, evName) => {
            model.events[evName] = ev;
          });
        }
      } else if (component.type == "composite") {
        // ----------- composite
        model.cardinality = component.cardinality;
        model.imports = {};
        // - subcomponents
        model.subcomponents = {};
        _.each(component.subcomponents, (_subcomp, id) => {
          // - get subcomponent type
          let subcompType = this.findComponentByPath(
            component[`@id`],
            _subcomp.type
          );
          if (!model.imports[subcompType[`@name`]] && !subcompType[`@core`]) {
            // - import subcomponent type
            model.imports[subcompType[`@name`]] =
              this.exportComponentModel(subcompType);
          }
          let subcomp = {};
          subcomp.type = subcompType[`@name`];
          if (_subcomp.cardinality) subcomp.cardinality = _subcomp.cardinality;
          if (_subcomp.durability) subcomp.durability = _subcomp.durability;
          if (_subcomp.variables) {
            subcomp.variables = {};
            _.each(_subcomp.variables, (_variable, id) => {
              // get var from type
              let typeVar = subcompType.variables[id];
              subcomp.variables[typeVar[`@name`]] = _variable.value;
            });
          }
          if (_subcomp.volumes) {
            subcomp.volumes = {};
            _.each(_subcomp.volumes, (_vol, id) => {
              let vol = {};
              if (_vol.scope) vol.scope = _vol.scope;
              if (_vol.durability) vol.durability = _vol.durability;
              if (_vol.url) vol.url = _vol.url;

              // get vol from type
              let typeVol = subcompType.volumes[id];
              subcomp.volumes[typeVol[`@name`]] = vol;
            });
          }
          model.subcomponents[_subcomp[`@name`]] = subcomp;
        });
        // - connectors
        model.connectors = {};
        _.each(component.connectors, (_con, id) => {
          let con;
          if (_con.type == "Link") {
            con = {
              type: "Link",
              inputs: [],
              outputs: [],
            };
          } else {
            // - get connector type
            let conType = this.findComponentByPath(component[`@id`], _con.type);
            if (!model.imports[conType[`@name`]] && !conType[`@core`]) {
              // - import connector type
              model.imports[conType[`@name`]] =
                this.exportComponentModel(conType);
            }
            con = {
              type: conType[`@name`],
              inputs: [],
              outputs: [],
            };
            if (_con.cardinality) con.cardinality = _con.cardinality;
            if (_con.durability) con.durability = _con.durability;
            if (_con.variables) {
              con.variables = {};
              _.each(_con.variables, (_variable, id) => {
                // get var from type
                let typeVar = conType.variables[id];
                con.variables[typeVar[`@name`]] = _variable.value;
              });
            }
            if (_con.volumes) {
              con.volumes = {};
              _.each(_con.volumes, (_vol, id) => {
                let vol = {};
                if (_vol.scope) vol.scope = _vol.scope;
                if (_vol.durability) vol.durability = _vol.durability;
                if (_vol.url) vol.url = _vol.url;

                // get vol from type
                let typeVol = conType.volumes[id];
                con.volumes[typeVol[`@name`]] = vol;
              });
            }
          }
          // - set inputs/outputs
          con.inputs = _.map(_con.inputs, (input) => {
            let [subcompName, epName] = input.split(".");
            let subcomp = component.subcomponents[subcompName];
            let subcompType = this.findComponentByPath(
              component[`@id`],
              subcomp.type
            );
            return `${subcomp["@name"]}.${subcompType.endpoints[epName]["@name"]}`;
          });
          con.outputs = _.map(_con.outputs, (output) => {
            let [subcompName, epName] = output.split(".");
            let subcomp = component.subcomponents[subcompName];
            let subcompType = this.findComponentByPath(
              component[`@id`],
              subcomp.type
            );
            return `${subcomp["@name"]}.${subcompType.endpoints[epName]["@name"]}`;
          });
          model.connectors[_con[`@name`]] = con;
        });

        if (component.variables) {
          model.variables = {};
          _.each(component.variables, (_variable, id) => {
            model.variables[_variable[`@name`]] = _variable.value;
            /*let variable = {};
            if (_variable.value) variable.value = _variable.value;
            if (_variable.mapping) {
              let [referredId, referredVarId] = _variable.mapping.split(
                this.$util.constants.MAPPING_SEPARATOR
              );
              let subcompOrCon =
                component.subcomponents[referredId] ||
                component.connectors[referredId];
              let subcompOrConType = this.findComponentByPath(
                component[`@id`],
                subcompOrCon.type
              );
              variable.mapping = `${subcompOrCon[`@name`]}${
                this.$util.constants.MAPPING_SEPARATOR
              }${subcompOrConType.variables[referredVarId][`@name`]}`;
            }
            model.variables[_variable[`@name`]] = variable;*/
          });
        }
        if (component.volumes) {
          model.volumes = {};
          _.each(component.volumes, (_vol, id) => {
            let vol = {};
            if (_vol.scope) vol.scope = _vol.scope;
            if (_vol.durability) vol.durability = _vol.durability;
            if (_vol.url) vol.url = _vol.url;
            if (_vol.mapping) {
              let [referredId, referredVolId] = _vol.mapping.split(
                this.$util.constants.MAPPING_SEPARATOR
              );
              let subcompOrCon =
                component.subcomponents[referredId] ||
                component.connectors[referredId];
              let subcompOrConType = this.findComponentByPath(
                component[`@id`],
                subcompOrCon.type
              );
              vol.mapping = `${subcompOrCon[`@name`]}${
                this.$util.constants.MAPPING_SEPARATOR
              }${subcompOrConType.volumes[referredVolId][`@name`]}`;
            }
            model.volumes[_vol[`@name`]] = vol;
          });
        }
        if (component.endpoints) {
          model.endpoints = {};
          _.each(component.endpoints, (_ep, id) => {
            let ep = {};
            if (_ep.type) ep.type = _ep.type;
            if (_ep.protocol) ep.protocol = _ep.protocol;
            if (_ep.required) ep.required = _ep.required;
            let [referredId, referredEpId] = _ep.mapping.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            let subcompOrCon =
              component.subcomponents[referredId] ||
              component.connectors[referredId];
            let subcompOrConType = this.findComponentByPath(
              component[`@id`],
              subcompOrCon.type
            );
            if (ep.type == "in") {
              ep.mapping = subcompOrCon[`@name`];
              // - get connected peer protocol
              let [peerId, peerEpId] = subcompOrCon.outputs[0].split(
                this.$util.constants.MAPPING_SEPARATOR
              );
              let peer = component.subcomponents[peerId];
              let peerType = this.findComponentByPath(
                component[`@id`],
                peer.type
              );
              ep.protocol = peerType.endpoints[peerEpId].protocol;
            } else if (ep.type == "out") {
              ep.mapping = `${subcompOrCon[`@name`]}${
                this.$util.constants.MAPPING_SEPARATOR
              }${subcompOrConType.endpoints[referredEpId][`@name`]}`;
            }
            model.endpoints[_ep[`@name`]] = ep;
          });
        }
      }

      this.$util.log(
        `[ComponentModel] FINISHED exportComponentModel(${
          _.isString(component) ? component : component[`@id`]
        }) = ${JSON.stringify(model)}`
      );
      return model;
    },

    /**
     * Export the layout of the specified component.
     *
     * @param {string} [path] - The component path. If not specified
     *                               the root is taken.
     * @param {Object} The exported layout
     */
    exportComponentLayout(path) {
      this.$util.log(`exportComponentLayout(${path})`);
      this.$util.log(`rootPath=${this.rootPath}`);

      if (!path) path = this.rootPath;

      let layout = undefined;
      
      let translate = (path) => {
        this.$util.log(`translate(${path})`);
        let names = [];
        let route = "";
        path
          .split(common.PATH_SEPARATOR)
          .slice(1)
          .forEach((subpath) => {
            route += common.PATH_SEPARATOR + subpath;
            let component = this.components[route];
            names.push(component[`@name`]);
          });
        this.$util.log(names);
        return common.PATH_SEPARATOR + names.join(common.PATH_SEPARATOR);
      };

      
      if (path == this.rootPath) {
        // get root layout
        let root = this.components[""];
        let subcomp = Object.values(root.subcomponents)[0];
        let compLayout = this.componentsLayout[""] && this.componentsLayout[""].subcomponents && this.componentsLayout[""].subcomponents[0] || {};
        //console.dir(subcomp);
        layout = {
          "": {
            subcomponents: [{
              id: subcomp[`@name`],
              type: subcomp.type,
              name: subcomp[`@name`],
              color: compLayout.color || subcomp.color || subcomp[`@color`] || this.components[this.rootPath]['@color']
            }],
            connectors: [],
            links: []
          }
        };
        this.$util.log("ROOT layout -> " + JSON.stringify(layout));
      }
      //console.dir(layout);

      /*this.$util.log(path);
      console.dir(this.components);
      console.dir(this.componentsLayout);*/

      let compLayout = this.componentsLayout[path];
      if (!compLayout) return layout;

      let component = this.components[path];
      let translatedPath = translate(path);

      layout = layout || {};
      layout[translatedPath] = {};
      //if (component[`@color`]) layout.color = component[`@color`];

      layout[translatedPath].subcomponents = _.map(
        compLayout.subcomponents,
        (subcomp) => {
          let subcompType = this.components[subcomp.component];
          return {
            id: component.subcomponents[subcomp.id][`@name`],
            type: subcomp.type,
            name: component.subcomponents[subcomp.id][`@name`],
            component: translate(subcomp.component),
            position: subcomp.position,
            size: subcomp.size,
            color: subcomp.color || subcomp['@color'] || subcompType['@color'],
            endpoints: _.map(subcomp.endpoints, (ep) => {
              return {
                id: subcompType.endpoints[ep.id][`@name`],
                name: subcompType.endpoints[ep.id][`@name`],
                type: ep.type,
                position: ep.position,
              };
            }),
          };
        }
      );
      layout[translatedPath].connectors = _.map(
        compLayout.connectors,
        (con) => {
          return {
            id: component.connectors[con.id][`@name`],
            type: con.type,
            name: component.connectors[con.id][`@name`],
            published: con.published,
            position: con.position,
            size: con.size,
            color: con.color,
          };
        }
      );
      layout[translatedPath].links = _.map(compLayout.links, (link) => {
        let _link = {
          id: link.id,
          type: link.type,
        };
        if (_.isString(link.source) || !link.source.port) {
          let id = link.source.id || link.source;
          _link.source = { id: component.connectors[id][`@name`] };
        } else {
          let compType = this.findComponentByPath(
            path,
            component.subcomponents[link.source.id].type
          );
          _link.source = {
            id: component.subcomponents[link.source.id][`@name`],
            port: compType.endpoints[link.source.port][`@name`],
          };
        }
        if (_.isString(link.target) || !link.target.port) {
          let id = link.target.id || link.target;
          _link.target = { id: component.connectors[id][`@name`] };
        } else {
          let compType = this.findComponentByPath(
            path,
            component.subcomponents[link.target.id].type
          );
          _link.target = {
            id: component.subcomponents[link.target.id][`@name`],
            port: compType.endpoints[link.target.port][`@name`],
          };
        }
        return _link;
        /*
          return {
            source: _.isString(link.source)? 
              component.subcomponents[link.source][`@name`]:
              {
                id: component.subcomponents[link.source.id][`@name`],
                port: component.subcomponents[link.source.id].endpoints[link.source.port]
              },
            target: _.isString(link.target)? 
              component.subcomponents[link.target][`@name`]:
              {
                id: component.subcomponents[link.target.id][`@name`],
                port: component.subcomponents[link.target.id].endpoints[link.target.port]
              },
          };*/
      });

      _.each(component.imports, (typeName) => {
        let subLayout = this.exportComponentLayout(
          `${path}${common.PATH_SEPARATOR}${typeName}`
        );
        Object.assign(layout, subLayout);
      });

      return layout;
    },

    /* ---------------------- Toolbar  ----------------------*/

    /**
     * Load the toolbar according to the current route.
     */
    loadToolbar() {
      this.$util.log(`[ComponentModel] loadToolbar()`);
      this.actions.splice(0, this.actions.length);

      // - add pointer
      this.actions.push({
        id: "pointer", //this.uuid(),
        name: "pointer",
        title: "Select",
        icon: "mdi-cursor-default-outline",
        selected: true,
      });
      if (this.componentPath != "") {
        // if not root, enable zoom options
        this.actions.push({
          id: this.uuid(),
          name: "zoom",
          action: "zoomIn",
          actions: [
            {
              id: "zoomIn",
              name: "zoomIn",
              title: "Zoom in",
              icon: "mdi-magnify-plus-outline",
            },
            {
              id: "zoomOut",
              name: "zoomOut",
              title: "Zoom out",
              icon: "mdi-magnify-minus-outline",
            },
            {
              id: "zoomFit",
              name: "zoomFit",
              title: "Fit content",
              icon: "mdi-fit-to-page-outline",
            },
            {
              id: "zoomPan",
              name: "zoomPan",
              title: "Pan tool",
              icon: "mdi-hand-back-right",
            },
          ],
        });
        if (
          this.myMode != "read" &&
          !this.findComponentByPath(this.componentPath)[`@origin`]
        ) {
          // if writable then add tools
          let componentsMenu = {
            id: this.uuid(),
            name: "component",
            action: "addComponent",
            actions: [
              {
                id: "addComponent",
                name: "addComponent",
                title: "Add component",
                //icon: "ks-basic",
                //icon: "mdi-rectangle-outline",
                //icon: "mdi-shape-rectangle-plus",
                //icon: "mdi-alpha-b-box-outline",
                //icon: "mdi-border-all-variant",
                icon: "mdi-card-outline",
                //icon: "mdi-checkbox-blank-outline",
              },
              {
                id: "addComposite",
                name: "addComposite",
                title: "Add composite",
                //icon: "mdi-application-outline",
                icon: "mdi-dock-top",
                //icon: "ks-composite",
                //icon: "mdi-shape-rectangle-plus"
              },
              /*{
                id: "importComponent",
                name: "importComponent",
                title: "Import component",
                icon: "mdi-import",
                //icon: "mdi-application-import",
                //icon: "ks-component-import",
                //icon: "mdi-import"
              },
              {
                id: "addRecursiveComponent",
                name: "addRecursive",
                title: "Add recursive",
                icon: "ks-component-recursive",
                //icon: "ks-component-import",
                //icon: "mdi-import"
              },*/
            ],
          };
          // - add library @core components
          _.each(this.components, (comp, path) => {
            if (comp["@core"] && comp["@component"]) {
              componentsMenu.actions.push({
                id: this.uuid(),
                name: comp.type == "basic" ? "addComponent" : "addComposite",
                title: `Add ${comp.name}`,
                icon: comp["@icon"]
                  ? `$${comp["@icon"]}`
                  : "mdi-help-box-outline" /*"ks-component-unknown"*/,
                data: path, // determines the component type to add
              });
            }
          });
          componentsMenu.actions.push({
            id: "importComponent",
            name: "importComponent",
            title: "Import component",
            icon: "mdi-import",
          });
          this.actions.push(componentsMenu);

          let connectorsMenu = {
            id: this.uuid(),
            name: "connector",
            //action: "addLink", // set later
            actions: [
              {
                id: "addLink",
                name: "addLink",
                title: "Add link",
                icon: "mdi-arrow-right",
                data: "Link",
              },
            ],
          };
          // - add library @core connectors
          _.each(this.components, (comp, path) => {
            if (comp["@core"] && comp["@connector"]) {
              connectorsMenu.actions.push({
                id: this.uuid(),
                name: "addConnector",
                title: `Add ${comp.name}`,
                icon: comp["@icon"]
                  ? `$${comp["@icon"]}`
                  : "mdi-help-circle-outline" /*"ks-connector-unknown"*/,
                data: path, // determines the component type to add
              });
            }
          });
          connectorsMenu.actions.push({
            id: "importConnector",
            name: "importConnector",
            title: "Import connector",
            icon: "ks-connector-import",
            //icon: "mdi-selection-ellipse-arrow-inside"
          });
          connectorsMenu.action = connectorsMenu.actions[0].id; // fix selected

          this.actions.push(connectorsMenu);
        }
      }
    },

    /**
     * Manages toolbar selected action
     *
     * @param {String} id - The selected action
     */
    onToolbarAction(id) {
      this.$util.log(`[ComponentModel] onToolbarAction(${id})`);
      // - look for subaction

      let [actionId, subactionId] = id.split("/");
      let action = this.actions.find((entry) => entry.id == actionId);
      if (subactionId) {
        // composed action
        action.action = subactionId;
        action = action.actions.find((entry) => entry.id == subactionId);
      }

      if (!this.selectedAction || this.selectedAction.id != action.id) {
        // - clean up previous action
        if (this.selectedAction && this[`${this.selectedAction.name}Destroy`])
          this[`${this.selectedAction.name}Destroy`]();

        // - reset action context
        this.actionContext = {};
        this.selectedAction = Object.assign({}, action);

        // - initialize new action
        if (this[`${this.selectedAction.name}Init`])
          this[`${this.selectedAction.name}Init`]();
      }
    },

    /**
     * Initializes the "pointer" action.
     */
    pointerInit() {
      this.$util.log(`[ComponentModel] pointerInit()`);
      this.actionContext = {
        selectedType: null,
        selectedId: null,
        selectedChild: null,
        selectedComponentType: null,
        selectedIcon: null,
      };
    },

    /**
     * Initializes the "importComponent" action.
     */
    importComponentInit() {
      this.$util.log(`[ComponentModel] importComponent()`);
      this.showImport = true;
    },
    /**
     * Initializes the "importConnector" action.
     */
    importConnectorInit() {
      this.$util.log(`[ComponentModel] importConnectortInit()`);
      this.showImport = true;
    },

    /* ---------------------- Properties  ----------------------*/

    /**
     * Load the selected component/subcomponent/connector properties
     * panel.
     *
     * @param {Object} [opts] - Additional options
     * @param {string} opts.active - Path of the selected property
     */
    loadProperties(opts) {
      this.$util.log(
        `[ComponentModel] loadProperties(${JSON.stringify(
          this.actionContext.selectedChild
        )})`
      );

      // If no target selected exit
      if (!this.actionContext.selectedType) return;

      opts = opts || { active: "basic" };

      // We define template (propsView) and model (propsModel)
      let basic = {
        id: "basic",
        type: "group",
        title: "Basic",
        icon: "mdi-information-outline",
        children: [],
      };
      let propsView = {
        id: "general",
        type: "super-group",
        active: opts.active,
        children: [basic],
      };
      let propsModel = {};

      // - set mode ('read','readonly','write')
      //   read: no changes are allowed
      //   readonly: the subcomponent may be changed but component not
      //   write: editable
      let mode = this.myMode;
      if (this.actionContext.selectedComponentType)
        mode =
          this.myMode == "read"
            ? "read"
            : (this.actionContext.selectedComponentType[`@origin`] &&
                "readonly") ||
              (this.actionContext.selectedComponentType[`@opaque`] &&
                "readonly") ||
              "write";

      // ---------------------- Basic --------------------
      //
      // - Type
      if (
        ["link", "connector-link"].includes(this.actionContext.selectedType) ||
        (this.actionContext.selectedType != "component" &&
          !this.actionContext.selectedComponentType[`@root`])
      ) {
        let type = {
          id: "type",
          type: "text",
          mode: "read" /*
            (this.actionContext.selectedType == "subcomponent" && 
            this.actionContext.selectedComponentType.type == "basic" && 
            mode) || "read",*/,
          title: "Type",
          path: "type",
        };
        basic.children.push(type);
        if (
          ["link", "connector-link"].includes(this.actionContext.selectedType)
        )
          propsModel.type = "Link";
        else
          propsModel.type = this.actionContext.selectedComponentType[`@name`];
      }

      // - Name
      if (
        ["component", "subcomponent", "connector"].includes(
          this.actionContext.selectedType
        )
      ) {
        let name = {
          id: "name",
          type: "text",
          mode: mode == "read" ? "read" : "write",
          title: "Name",
          path: `@name`,
          errorPath: "@nameError",
          postActionPath: "@namePostAction",
          validate: {
            pattern: "^[^\\/\\s][^\\/]*$",
            message: "Invalid pattern",
          },
        };
        basic.children.push(name);
        if (this.actionContext.selectedType == "component")
          propsModel[`@name`] =
            this.actionContext.selectedComponentType[`@name`];
        else
          propsModel[`@name`] =
            this.actionContext.selectedChild[`@name`] ||
            this.actionContext.selectedComponentType[`@name`];
        /*if (mode == "readonly") {
          // - if original component is readonly then enable/disable overwriting/restoring
          //   regarding original value
          propsModel[`@namePostAction`] = `mdi-restore:restoreReferred`;
        }*/
      }

      // - Cardinality
      if (
        ["component", "subcomponent"].includes(this.actionContext.selectedType)
      ) {
        let cardinality = {
          type: "conditional-group",
          condition: {
            id: "cardinality",
            type: "select",
            mode: mode == "read" ? "read" : "write",
            modePath: "@cardinalityMode",
            title: "Cardinality",
            path: "cardinality",
            postActionPath: "@cardinalityPostAction",
            default: "[0:100]",
            values: [
              { title: "Any", value: "" }, // empty string
              { title: "Elastic", value: "[:]" },
              { title: "Singleton", value: "[1:1]" },
              { title: "Custom", pattern: "\\[\\d+:\\d+\\]", value: "[1:10]" },
              { title: "Pattern", pattern: "^.*$", value: "[{{MIN}}:{{MAX}}]" },
            ],
          },
          children: {
            "^.{0}$": [], // any
            "\\[:\\]": [], // elastic
            "\\[1:1\\]": [], // singleton
            "\\[\\d+:\\d+\\]": [
              // custom
              {
                id: "cardinalityLimits",
                type: "range",
                mode: mode == "read" ? "read" : "write",
                modePath: "@cardinalityMode",
                title: "[Min instances:Max instances]",
                path: "cardinality",
              },
            ],
            "^.*$": [
              // pattern
              {
                id: "cardinalityPattern",
                type: "text",
                mode: mode == "read" ? "read" : "write",
                modePath: "@cardinalityMode",
                title: "Pattern",
                path: "cardinality",
              },
            ],
          },
        };
        basic.children.push(cardinality);

        // - cardinality can be set at both component and subcomponent
        //   levels, with component level priority
        if (this.actionContext.selectedType == "component") {
          propsModel["cardinality"] =
            this.actionContext.selectedComponentType["cardinality"];
        } else {
          propsModel["cardinality"] =
            this.actionContext.selectedComponentType["cardinality"] ||
            this.actionContext.selectedChild["cardinality"] ||
            "";
          if (
            this.actionContext.selectedComponentType[`cardinality`] &&
            (this.actionContext.selectedComponentType.type == "composite" ||
              mode == "readonly")
          ) {
            propsModel[`@cardinalityMode`] = "read";
          }
        }
      }

      // - Durability (only for basic)
      if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic"
      ) {
        // - only for basic
        /*let durability = {
          id: "durability",
          type: "select",
          mode: mode == "read" ? "read" : "write",
          modePath: "@durabilityMode",
          title: "Durability",
          path: "durability",
          postActionPath: "@durabilityPostAction",
          values: [
            { title: "Any", value: "" }, // overwritable
            { title: "Ephemeral", value: "ephemeral" },
            { title: "Permanent", value: "permanent" },
          ],
        };*/
        let durability = {
          id: "durability",
          type: "conditional-group",
          condition: {
            id: "durability",
            type: "select",
            mode: mode == "read" ? "read" : "write",
            modePath: "@durabilityMode",
            title: "Durability",
            path: "durability",
            postActionPath: "@durabilityPostAction",
            values: [
              { title: "Any", value: "" }, // overwritable
              { title: "Ephemeral", value: "ephemeral" },
              { title: "Permanent", value: "permanent" },
              { title: "Pattern", pattern: "^.*$", value: "{{DURABILITY}}" },
            ],
          },
          children: {
            "^.{0}$": [], // any
            ephemeral: [], // ephemeral
            permanent: [], // permanent
            "^.*$": [
              // pattern
              {
                id: "durabilityPattern",
                type: "text",
                mode: mode == "read" ? "read" : "write",
                modePath: "@durabilityMode",
                title: "Pattern",
                path: "durability",
              },
            ],
          },
        };
        basic.children.push(durability);

        // - durability can be set at both component and subcomponent
        //   levels, with component level priority
        if (this.actionContext.selectedType == "component") {
          propsModel["durability"] =
            this.actionContext.selectedComponentType["durability"];
        } else {
          propsModel["durability"] =
            this.actionContext.selectedComponentType["durability"] ||
            this.actionContext.selectedChild["durability"] ||
            "";
          if (
            this.actionContext.selectedComponentType[`durability`] &&
            (this.actionContext.selectedComponentType.type == "composite" ||
              mode == "readonly")
          ) {
            propsModel[`@durabilityMode`] = "read";
          }
        }
      }

      // - Runtime (only for basic)
      if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic"
      ) {
        // - only for basic
        /*let runtime = {
          id: "runtime",
          type: "select",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Runtime",
          path: "runtime",
          values: [{ title: "Docker", value: "docker" }],
        };
        basic.children.push(runtime);
        propsModel["runtime"] = this.actionContext.selectedComponentType[
          "runtime"
        ];
      }*/
        let runtime = {
          id: "runtime",
          type: "conditional-group",
          condition: {
            id: "runtime",
            type: "select",
            mode: mode.startsWith("read") ? "read" : "write",
            title: "Runtime",
            path: "runtime",
            values: [
              { title: "Docker", value: "docker" },
              { title: "Pattern", pattern: ".*", value: "{{RUNTIME}}" },
            ],
          },
          children: {
            docker: [], // docker
            ".*": [
              // pattern
              {
                id: "runtimePattern",
                type: "text",
                mode: mode.startsWith("read") ? "read" : "write",
                title: "Pattern",
                path: "runtime",
              },
            ],
          },
        };
        basic.children.push(runtime);
        propsModel["runtime"] =
          this.actionContext.selectedComponentType["runtime"];
      }

      // - Source (only for basic)
      if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic"
      ) {
        // - only for basic
        let source = {
          id: "source",
          type: "text",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Source",
          path: "source",
        };
        basic.children.push(source);
        propsModel["source"] =
          this.actionContext.selectedComponentType["source"];
      }

      // - Schedule (only for basic)
      if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic"
      ) {
        // - only for basic
        let schedule = {
          id: "schedule",
          type: "text",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Schedule",
          path: "schedule",
        };
        basic.children.push(schedule);
        propsModel["schedule"] =
          this.actionContext.selectedComponentType["schedule"];
      }

      // - Published (only for connectors bound to a target)
      if (
        this.actionContext.selectedType == "connector" &&
        this.actionContext.selectedChild.outputs &&
        this.actionContext.selectedChild.outputs.length
      ) {
        let published = {
          id: "connectorPublished",
          type: "conditional-group",
          condition: {
            id: "published",
            type: "check",
            mode: mode == "read" ? "read" : "write",
            title: "Published",
            path: "@published",
            default: "false",
          },
          children: {
            false: [],
            true: [
              {
                id: "connectorReferrerName",
                type: "text",
                mode: mode == "read" ? "read" : "write",
                title: "Published Name",
                path: "@referrerName",
                errorPath: "@referrerNameError",
                validate: {
                  pattern: "^[^\\/\\s][^\\/]*$",
                  message: "Invalid pattern",
                },
                /*postAction: {
                  icon: "mdi-open-in-app",
                  name: "jumpToReferrer",
                },*/
              },
            ],
          },
        };
        basic.children.push(published);

        // - look for published endpoints
        let containerEp = _.find(
          this.findComponentByPath(this.componentPath).endpoints,
          (ep, epId) => {
            /*let [subcomp, subcompEp] = ep.mapping.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            return !subcompEp && subcomp == this.actionContext.selectedId;*/
            return ep.mapping == this.actionContext.selectedChild[`@id`];
          }
        );
        if (containerEp) {
          propsModel[`@published`] = true;
          propsModel[`@referrerId`] = containerEp[`@id`];
          propsModel[`@referrerName`] = containerEp[`@name`];
        }
      }

      // ---------------------- Variables --------------------
      //
      if (
        (!["link", "connector-link"].includes(
          this.actionContext.selectedType
        ) &&
          this.actionContext.selectedComponentType.variables &&
          Object.keys(this.actionContext.selectedComponentType.variables)
            .length) ||
        (this.actionContext.selectedType == "subcomponent" &&
          this.actionContext.selectedComponentType.type == "basic") ||
        this.actionContext.selectedType == "component"
        /*this.actionContext.selectedType != "connector" &&
          !this.actionContext.selectedComponentType[`@origin`])*/
      ) {
        let variables = {
          id: "variables",
          type: "list-group",
          mode:
            (this.actionContext.selectedType == "subcomponent" &&
              this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            (mode.startsWith("read") ? "read" : "write"),
          title: "Variables",
          icon: "mdi-variable",
          path: "variables",
          idPath: "@name",
          iconPath: "@icon",
          default: {
            "@name": "VARIABLE",
            value: "",
          },
          children: [],
        };
        propsView.children.push(variables);

        // - Variable Name
        variables.children.push({
          id: "varName",
          type: "text",
          mode:
            (this.actionContext.selectedType == "subcomponent" &&
              this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            (mode.startsWith("read") ? "read" : "write"),
          title: "Name",
          path: "@name",
          errorPath: "@nameError",
          //info: "Click to see definition",
          validate: {
            pattern: "^[^\\/\\s][^\\/]*$",
            message: "Invalid pattern",
          },
          /*postAction: {
            // jump to definition
            icon: "mdi-open-in-app",
            name: "jumpToReferred",
          },*/
        });

        // - Variable Value
        variables.children.push({
          id: "varValue",
          type: "text",
          mode: mode == "read" ? "read" : "write",
          title: "Value",
          path: "value",
          infoPath: "@valueInfo",
          //preActionPath: "@valuePreAction",
          //postActionPath: "@valuePostAction", // restore with inherited value
        });

        /*// - Variable Published
        if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          variables.children.push({
            id: "varPublished",
            type: "conditional-group",
            condition: {
              id: "varPublished",
              type: "check",
              mode: mode == "read" ? "read" : "write",
              title: "Published",
              path: "@published",
              default: "false",
            },
            children: {
              false: [],
              true: [
                {
                  id: "varReferrerName",
                  type: "text",
                  mode: mode == "read" ? "read" : "write",
                  title: "Published Name",
                  path: "@referrerName",
                  errorPath: "@referrerNameError",
                  validate: {
                    pattern: "^[^\\/\\s][^\\/]*$",
                    message: "Invalid pattern",
                  },
                  postAction: {
                    icon: "mdi-open-in-app",
                    name: "jumpToReferrer",
                  },
                },
              ],
            },
          });
        }*/

        propsModel.variables = {};
        _.each(
          this.actionContext.selectedComponentType.variables,
          (variable, varId) => {
            propsModel.variables[varId] = {};
            propsModel.variables[varId][`@id`] = variable[`@id`];
            propsModel.variables[varId][`@name`] = variable[`@name`];
            propsModel.variables[varId][`value`] = variable[`value`];

            /*if (this.actionContext.selectedComponentType.type == "composite") {
              // - look for inherited value
              let inheritedVariable;
              if (this.actionContext.selectedType == "component") {
                let [subcompId, varRefId] = variable.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                inheritedVariable = this.getOnCascade(
                  this.route(this.currentRoute, subcompId),
                  `variables/${varRefId}/value`
                );
              } else {
                inheritedVariable = this.getOnCascade(
                  this.route(this.currentRoute, this.actionContext.selectedId),
                  `variables/${varId}/value`,
                  { startFromComponent: true }
                );
              }
              if (inheritedVariable.route) {
                propsModel.variables[varId].value = inheritedVariable.value;
                propsModel.variables[varId][`@nameInfo`] =
                  "Inherited. Click to definition.";
                propsModel.variables[varId][`@namePostAction`] =
                  "mdi-open-in-app:jumpToReferred";
                propsModel.variables[varId][`@valuePostAction`] =
                  "mdi-restore:restoreReferred";
                propsModel.variables[varId][`@referredRoute`] =
                  inheritedVariable.route;
                let splitted = inheritedVariable.id.split("/");
                propsModel.variables[varId][`@referredId`] = splitted[1];
              }

              // - overwrite possibly inherited value
              if (variable.hasOwnProperty("value")) {
                propsModel.variables[varId].value = variable.value;
                propsModel.variables[varId][
                  `@valuePostAction`
                ] = `mdi-restore:restoreReferred`;
              }
            }*/

            if (
              ["subcomponent", "connector"].includes(
                this.actionContext.selectedType
              )
            ) {
              // - look for subcomponent/connector
              // - overwrite variable value
              if (
                this.actionContext.selectedChild.variables &&
                this.actionContext.selectedChild.variables[varId] &&
                this.actionContext.selectedChild.variables[varId].value
              ) {
                propsModel.variables[varId].value =
                  this.actionContext.selectedChild.variables[varId].value;
              }
            }
          }
        );
        // - look for published variables (only if not root component)
        /*if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          _.each(
            this.findComponentByPath(this.componentPath).variables,
            (variable, varId) => {
              if (variable.mapping) {
                let [subcompId, mappedVarId] = variable.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                if (subcompId == this.actionContext.selectedChild[`@id`]) {
                  propsModel.variables[mappedVarId][`@published`] = true;
                  propsModel.variables[mappedVarId][`@referrerId`] = varId;
                  propsModel.variables[mappedVarId][`@referrerName`] =
                    variable[`@name`];
                  propsModel.variables[mappedVarId][`@icon`] =
                    "mdi-eye-outline";
                }
              }
            }
          );
        }*/
      }

      // ---------------------- Endpoints --------------------
      //
      if (
        (!["link", "connector-link", "connector"].includes(
          this.actionContext.selectedType
        ) &&
          this.actionContext.selectedComponentType.endpoints &&
          Object.keys(this.actionContext.selectedComponentType.endpoints)
            .length) ||
        (this.actionContext.selectedType == "subcomponent" &&
          this.actionContext.selectedComponentType.type == "basic" &&
          !this.actionContext.selectedComponentType[`@origin`])
      ) {
        let endpoints = {
          id: "endpoints",
          type: "list-group",
          mode:
            (this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            (mode.startsWith("read") ? "read" : "write"),
          title: "Endpoints",
          icon: "mdi-triangle",
          path: "endpoints",
          idPath: "@name",
          iconPath: "@icon",
          default: {
            "@name": "endpoint",
            type: "in",
            protocol: "http",
            required: false,
          },
          children: [],
        };
        propsView.children.push(endpoints);

        // - Endpoint Name
        endpoints.children.push({
          id: "epName",
          type: "text",
          mode:
            (this.actionContext.selectedType == "subcomponent" &&
              this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            mode.startsWith("read")
              ? "read"
              : "write",
          title: "Name",
          path: "@name",
          errorPath: "@nameError",
          validate: {
            pattern: "^[^\\/\\s][^\\/]*$",
            message: "Invalid pattern",
          },
        });

        // - Endpoint Type
        endpoints.children.push({
          id: "epType",
          type: "select",
          mode:
            (this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            mode.startsWith("read")
              ? "read"
              : "write",
          title: "Type",
          path: "type",
          values: [
            { title: "In", value: "in" },
            { title: "Out", value: "out" },
          ],
        });

        // Endpoint Protocol
        endpoints.children.push({
          id: "epProtocol",
          type: "conditional-group",
          condition: {
            id: "epProtocol",
            type: "select",
            mode:
              (this.actionContext.selectedComponentType.type == "composite" &&
                "read") ||
              mode.startsWith("read")
                ? "read"
                : "write",
            title: "Protocol",
            path: "protocol",
            values: [
              { title: "HTTP", value: "http" },
              { title: "TCP", pattern: "tcp:\\d+", value: "tcp:80" },
              {
                title: "Pattern",
                pattern: ".*",
                value: "{{PROTOCOL}}:{{PORT}}",
              },
            ],
            /*default: "tcp:80",
            catchAll: "*",
            values: [
              { title: "HTTP", value: "http" },
              { title: "TCP", value: "*" },
            ],*/
          },
          children: {
            http: [],
            "tcp:\\d+": [
              {
                id: "epPort",
                type: "number",
                mode:
                  (this.actionContext.selectedComponentType.type ==
                    "composite" &&
                    "read") ||
                  mode.startsWith("read")
                    ? "read"
                    : "write",
                title: "Port",
                path: "protocol",
                default: "80",
                prepend: "tcp:",
              },
            ],
            ".*": [
              {
                id: "protocolPattern",
                type: "text",
                mode: mode.startsWith("read") ? "read" : "write",
                title: "Pattern",
                path: "protocol",
              },
            ],
          },
        });

        // Endpoint Required
        endpoints.children.push({
          id: "epRequired",
          type: "check",
          mode:
            (this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            mode.startsWith("read")
              ? "read"
              : "write",
          title: "Required",
          path: "required",
        });

        /*- Endpoint Published
        if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          endpoints.children.push({
            type: "conditional-group",
            condition: {
              id: "epPublished",
              type: "check",
              mode: mode == "read" ? "read" : "write",
              title: "Published",
              path: "@published",
              default: "false",
            },
            children: {
              false: [],
              true: [
                {
                  id: "epReferrerName",
                  type: "text",
                  mode: mode == "read" ? "read" : "write",
                  title: "Published Name",
                  path: "@referrerName",
                  errorPath: "@referrerNameError",
                  validate: {
                    pattern: "^[^\\/\\s][^\\/]*$",
                    message: "Invalid pattern",
                  },
                  postAction: {
                    icon: "mdi-open-in-app",
                    name: "jumpToReferrer",
                  },
                },
              ],
            },
          });
        }*/

        if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          endpoints.children.push({
            type: "conditional-group",
            condition: {
              path: "type",
            },
            children: {
              in: [],
              out: [
                {
                  type: "conditional-group",
                  condition: {
                    id: "epPublished",
                    type: "check",
                    mode: mode == "read" ? "read" : "write",
                    title: "Published",
                    path: "@published",
                    default: "false",
                  },
                  children: {
                    false: [],
                    true: [
                      {
                        id: "epReferrerName",
                        type: "text",
                        mode: mode == "read" ? "read" : "write",
                        title: "Published Name",
                        path: "@referrerName",
                        errorPath: "@referrerNameError",
                        validate: {
                          pattern: "^[^\\/\\s][^\\/]*$",
                          message: "Invalid pattern",
                        },
                        /*postAction: {
                          icon: "mdi-open-in-app",
                          name: "jumpToReferrer",
                        },*/
                      },
                    ],
                  },
                },
              ],
            },
          });
        }

        propsModel.endpoints = {};
        _.each(
          this.actionContext.selectedComponentType.endpoints,
          (endpoint, epId) => {
            propsModel.endpoints[epId] = {};
            propsModel.endpoints[epId][`@id`] = endpoint[`@id`];
            propsModel.endpoints[epId][`@name`] = endpoint[`@name`];
            propsModel.endpoints[epId][`type`] = endpoint[`type`];
            propsModel.endpoints[epId][`protocol`] = endpoint[`protocol`];
            propsModel.endpoints[epId][`required`] = endpoint[`required`];

            /*if (this.actionContext.selectedComponentType.type == "composite") {
              // - look for inherited value
              let inheritedEp;
              if (this.actionContext.selectedType == "component") {

                let [subcompId, epRefId] = endpoint.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                inheritedEp = this.getOnCascade(
                  this.route(this.currentRoute, subcompId),
                  `endpoints/${epRefId}`
                );
              } else {
                inheritedEp = this.getOnCascade(
                  this.route(this.currentRoute, this.actionContext.selectedId),
                  `endpoints/${epId}`,
                  { startFromComponent: true }
                );
              }
              if (inheritedEp.route) {
                propsModel.endpoints[epId][`type`] = inheritedEp.value[`type`];
                propsModel.endpoints[epId][`protocol`] =
                  inheritedEp.value[`protocol`];
                propsModel.endpoints[epId][`required`] =
                  inheritedEp.value[`required`];
                propsModel.endpoints[epId][`@referredRoute`] =
                  inheritedEp.route;
                let splitted = inheritedEp.id.split("/");
                propsModel.endpoints[epId][`@referredId`] = splitted[1];
              }
            }*/
          }
        );
        // - look for published endpoints (only if not root component)
        if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          _.each(
            this.findComponentByPath(this.componentPath).endpoints,
            (endpoint, epId) => {
              if (endpoint.mapping) {
                let [subcompId, mappedEpId] = endpoint.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                if (subcompId == this.actionContext.selectedChild[`@id`]) {
                  propsModel.endpoints[mappedEpId][`@published`] = true;
                  propsModel.endpoints[mappedEpId][`@referrerId`] = epId;
                  propsModel.endpoints[mappedEpId][`@referrerName`] =
                    endpoint[`@name`];
                  propsModel.endpoints[mappedEpId][`@icon`] = "mdi-eye-outline";
                }
              }
            }
          );
        }
      }

      // ---------------------- Volumes --------------------
      //
      if (
        (!["link", "connector-link"].includes(
          this.actionContext.selectedType
        ) &&
          this.actionContext.selectedComponentType.volumes &&
          Object.keys(this.actionContext.selectedComponentType.volumes)
            .length) ||
        (this.actionContext.selectedType == "subcomponent" &&
          this.actionContext.selectedComponentType.type == "basic" &&
          !this.actionContext.selectedComponentType[`@origin`])
      ) {
        let volumes = {
          id: "volumes",
          type: "list-group",
          mode:
            (this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            (mode.startsWith("read") ? "read" : "write"),
          title: "Volumes",
          icon: "mdi-database",
          path: "volumes",
          idPath: "@name",
          iconPath: "@icon",
          default: {
            "@name": "volume",
            type: "local",
            path: "/volume",
            scope: "",
            durability: "",
          },
          children: [],
        };
        propsView.children.push(volumes);

        // - Volume Name
        volumes.children.push({
          id: "volName",
          type: "text",
          mode:
            (this.actionContext.selectedType == "subcomponent" &&
              this.actionContext.selectedComponentType.type == "composite" &&
              "read") ||
            (mode.startsWith("read") ? "read" : "write"),
          title: "Name",
          path: "@name",
          info: "Click to see definition",
          errorPath: "@nameError",
          validate: {
            pattern: "^[^\\/\\s][^\\/]*$",
            message: "Invalid pattern",
          },
          /*postAction: {
            // jump to definition
            icon: "mdi-open-in-app",
            name: "jumpToReferred",
          },*/
        });

        // - Volume Type
        /*volumes.children.push({
          id: "volType",
          type: "select",
          mode: mode == "read" ? "read" : "write",
          title: "Type",
          path: "type",
          visiblePath: "@typeVisible", // overwritable
          values: [{ title: "Local", value: "local" }],
        });*/
        volumes.children.push({
          id: "volType",
          type: "conditional-group",
          condition: {
            id: "volType",
            type: "select",
            mode: mode == "read" ? "read" : "write",
            title: "Type",
            path: "type",
            visiblePath: "@typeVisible", // overwritable
            values: [
              { title: "Local", value: "local" },
              { title: "Pattern", pattern: ".*", value: "{{VOLUME_TYPE}}" },
            ],
          },
          children: {
            local: [],
            ".*": [
              // pattern
              {
                id: "volTypePattern",
                type: "text",
                mode: mode.startsWith("read") ? "read" : "write",
                title: "Pattern",
                path: "type",
                visiblePath: "@typeVisible", // overwritable
              },
            ],
          },
        });

        // - Volume Scope
        volumes.children.push({
          id: "volScope",
          type: "select",
          mode: mode == "read" ? "read" : "write",
          modePath: "@scopeMode", // overwritable
          visiblePath: "@scopeVisible", // overwritable
          title: "Scope",
          path: "scope",
          values: [
            { title: "Any", value: "" },
            { title: "Local", value: "local" },
            { title: "Global", value: "global" },
          ],
        });

        // - Volume Durability
        volumes.children.push({
          id: "volDurability",
          type: "conditional-group",
          condition: {
            id: "volDurability",
            type: "select",
            mode: mode == "read" ? "read" : "write",
            modePath: "@durabilityMode", // overwritable
            title: "Durability",
            path: "durability",
            default: "ephemeral",
            values: [
              { title: "Any", value: "" },
              { title: "Ephemeral", value: "ephemeral" },
              { title: "Permanent", value: "permanent" },
            ],
          },
          children: {
            "^.{0}$": [],
            ephermeral: [],
            permanent: [
              {
                id: "volUrl",
                type: "text",
                mode: mode == "read" ? "read" : "write",
                modePath: "@volMode", // overwritable
                title: "Url",
                path: "url",
              },
            ],
          },
        });

        // - Volume Published
        if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          volumes.children.push({
            id: "volPublished",
            type: "conditional-group",
            condition: {
              id: "volPublished",
              type: "check",
              mode: mode == "read" ? "read" : "write",
              title: "Published",
              path: "@published",
              default: "false",
            },
            children: {
              false: [],
              true: [
                {
                  id: "volReferrerName",
                  type: "text",
                  mode: mode == "read" ? "read" : "write",
                  title: "Published Name",
                  path: "@referrerName",
                  errorPath: "@referrerNameError",
                  validate: {
                    pattern: "^[^\\/\\s][^\\/]*$",
                    message: "Invalid pattern",
                  },
                  /*postAction: {
                    icon: "mdi-open-in-app",
                    name: "jumpToReferrer",
                  },*/
                },
              ],
            },
          });
        }

        propsModel.volumes = {};
        _.each(
          this.actionContext.selectedComponentType.volumes,
          (vol, volId) => {
            propsModel.volumes[volId] = {};
            propsModel.volumes[volId][`@id`] = vol[`@id`];
            propsModel.volumes[volId][`@name`] = vol[`@name`];
            propsModel.volumes[volId][`type`] = vol.type || "";
            propsModel.volumes[volId][`path`] = vol.path || "";
            propsModel.volumes[volId][`scope`] = vol.scope || "";
            propsModel.volumes[volId][`durability`] = vol.durability || "";
            propsModel.volumes[volId][`url`] = vol.url || "";

            if (this.actionContext.selectedComponentType.type == "composite") {
              // - Hide type
              propsModel.volumes[volId][`@typeVisible`] = false;
              // - look for inherited scope
              let inheritedScope;
              if (this.actionContext.selectedType == "component") {
                let [subcompId, volRefId] = vol.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                inheritedScope = this.getOnCascade(
                  this.route(this.currentRoute, subcompId),
                  `volumes/${volRefId}/scope`
                );
              } else {
                inheritedScope = this.getOnCascade(
                  this.route(this.currentRoute, this.actionContext.selectedId),
                  `volumes/${volId}/scope`,
                  { startFromComponent: true }
                );
              }
              if (inheritedScope.route) {
                propsModel.volumes[volId][`@scopeVisible`] = false;
              }

              // - look for inherited durability
              let inheritedDurability;
              if (this.actionContext.selectedType == "component") {
                let [subcompId, volRefId] = vol.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                inheritedDurability = this.getOnCascade(
                  this.route(this.currentRoute, subcompId),
                  `volumes/${volRefId}/durability`
                );
              } else {
                inheritedDurability = this.getOnCascade(
                  this.route(this.currentRoute, this.actionContext.selectedId),
                  `volumes/${volId}/durability`,
                  { startFromComponent: true }
                );
              }
              if (inheritedDurability.route) {
                propsModel.volumes[volId][`durability`] =
                  inheritedDurability.value;
                propsModel.volumes[volId][`@durabilityMode`] = "read";
                propsModel.volumes[volId][`@durabilityPostAction`] =
                  "mdi-restore:restoreReferred";

                // - look for inherited url
                let inheritedUrl;
                if (this.actionContext.selectedType == "component") {
                  let [subcompId, volRefId] = vol.mapping.split(
                    this.$util.constants.MAPPING_SEPARATOR
                  );
                  inheritedUrl = this.getOnCascade(
                    this.route(this.currentRoute, subcompId),
                    `volumes/${volRefId}/url`
                  );
                } else {
                  inheritedUrl = this.getOnCascade(
                    this.route(
                      this.currentRoute,
                      this.actionContext.selectedId
                    ),
                    `volumes/${volId}/url`,
                    { startFromComponent: true }
                  );
                }
                if (inheritedUrl.route) {
                  propsModel.volumes[volId][`url`] = inheritedUrl.value;
                }
              }
              // - overwrite possibly inhertied properties
              if (vol.scope) propsModel.volumes[volId][`scope`] = vol.scope;
              if (vol.durability)
                propsModel.volumes[volId][`durability`] = vol.durability;
              if (vol.url) propsModel.volumes[volId][`url`] = vol.url;
            }

            if (
              ["subcomponent", "connector"].includes(
                this.actionContext.selectedType
              )
            ) {
              // - look for subcomponent/connector
              // - overwrite volumes properties
              if (
                this.actionContext.selectedChild.volumes &&
                this.actionContext.selectedChild.volumes[volId]
              ) {
                if (this.actionContext.selectedChild.volumes[volId].scope)
                  propsModel.volumes[volId][`scope`] =
                    this.actionContext.selectedChild.volumes[volId].scope;
                if (this.actionContext.selectedChild.volumes[volId].durability)
                  propsModel.volumes[volId][`durability`] =
                    this.actionContext.selectedChild.volumes[volId].durability;
                if (this.actionContext.selectedChild.volumes[volId].url)
                  propsModel.volumes[volId][`url`] =
                    this.actionContext.selectedChild.volumes[volId].url;
              }
            }
          }
        );
        // - look for published volumes (only if not root component)
        if (
          !this.actionContext.selectedComponentType[`@root`] &&
          ["subcomponent", "connector"].includes(
            this.actionContext.selectedType
          )
        ) {
          _.each(
            this.findComponentByPath(this.componentPath).volumes,
            (vol, volId) => {
              if (vol.mapping) {
                let [subcompId, mappedVolId] = vol.mapping.split(
                  this.$util.constants.MAPPING_SEPARATOR
                );
                if (subcompId == this.actionContext.selectedChild[`@id`]) {
                  propsModel.volumes[mappedVolId][`@published`] = true;
                  propsModel.volumes[mappedVolId][`@referrerId`] = volId;
                  propsModel.volumes[mappedVolId][`@referrerName`] =
                    vol[`@name`];
                  propsModel.volumes[mappedVolId][`@icon`] = "mdi-eye-outline";
                }
              }
            }
          );
        }
      }

      // ---------------------- Events --------------------
      //
      if (
        this.actionContext.selectedType == "subcomponent" &&
        this.actionContext.selectedComponentType.type == "basic"
      ) {
        let events = {
          id: "events",
          type: "group",
          title: "Events",
          icon: "mdi-cog",
          children: [],
        };
        propsView.children.push(events);

        let init = {
          id: "init",
          type: "text",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Init",
          path: "init",
        };
        events.children.push(init);

        let cfg = {
          id: "cfg",
          type: "text",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Cfg",
          path: "cfg",
        };
        events.children.push(cfg);

        let ping = {
          id: "ping",
          type: "text",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Ping",
          path: "ping",
        };
        events.children.push(ping);

        let destroy = {
          id: "destroy",
          type: "text",
          mode: mode.startsWith("read") ? "read" : "write",
          title: "Destroy",
          path: "destroy",
        };
        events.children.push(destroy);

        propsModel.init = this.actionContext.selectedComponentType.events.init;
        propsModel.cfg = this.actionContext.selectedComponentType.events.cfg;
        propsModel.ping = this.actionContext.selectedComponentType.events.ping;
        propsModel.destroy = this.actionContext.selectedComponentType.events.destroy;

      }

      // make reactive
      this.$set(this, "propertiesView", null);
      this.$set(this, "propertiesView", {});
      this.makeReactive(this.propertiesView, propsView);

      this.$set(this, "propertiesModel", null);
      this.$set(this, "propertiesModel", {});
      this.makeReactive(this.propertiesModel, propsModel);

      // - scroll to section
      if (opts.active) {
        setTimeout(() => {
          let element = document.getElementById(opts.active);
          if (element)
            this.$refs.propertiesPanel.$el.scrollTo(
              0,
              element.offsetTop - 100 /* toolbar */
            );
        }, 100);
      }
    },

    /**
     * Navigate to the specified subcomponent, optionally selecting a
     * subcomponent/connector and optionally showing its properties.
     *
     * @param {string} route - The subcomponent route to navigate to
     * @param {Object} [opts] - Additional options
     * @param {boolean} opts.forceReload - Force reload, even if nothing has changed
     * @param {string} opts.selectedId - The subcomponent/connector id to select
     * @param {string} opts.selectedType - The selected type: 'component', 'subcomponent', 'connector', 'link'
     * @param {string} opts.selectedPath - The subpath of the subcomponent/connector to select
     * @param {Object} opts.selectedData - Additional data
     */
    navigate(route, opts) {
      this.$util.log(
        `[ComponentModel] navigate(${route}, ${JSON.stringify(opts)})`
      );
      opts = opts || {};

      // jumping to a component means action == "pointer"
      //this.$set(this.selectedAction, "name", "pointer");
      this.onToolbarAction("pointer");

      if (
        opts.forceReload ||
        this.currentRoute != route ||
        this.actionContext.selectedType !== opts.type ||
        this.actionContext.selectedId !== opts.selectedId
      ) {
        // - if we have to change selection, we
        //   refresh everything
        //
        this.currentRoute = route;

        this.actionContext.selectedType = opts.selectedType;
        this.actionContext.selectedId = opts.selectedId;
        this.actionContext.selectedChild = null;
        this.actionContext.selectedComponentType = null;
        this.actionContext.selectedIcon = null;
        this.actionContext.selectedData = null;

        if (this.actionContext.selectedId != null) {
          this.$set(this.selectedAction, "selectedId", opts.selectedId);
        } else {
          this.$delete(this.selectedAction, "selectedId");
          this.$delete(this.selectedAction, "menu");
        }

        let menu = [];
        if (this.actionContext.selectedType == "subcomponent") {
          // if subcomponent has been selected
          let route = this.route(
            this.currentRoute,
            this.actionContext.selectedId
          );
          this.actionContext.selectedComponentType =
            this.findComponentByRoute(route);
          this.actionContext.selectedChild = this.findComponentByPath(
            this.componentPath
          ).subcomponents[this.actionContext.selectedId];

          if (this.actionContext.selectedComponentType.type == "basic") {
            // - properties panel icon
            if (this.actionContext.selectedComponentType[`@icon`])
              this.actionContext.selectedIcon =
                "$" + this.actionContext.selectedComponentType[`@icon`];
            else this.actionContext.selectedIcon = "ks-basic";
            if (
              this.myMode == "write" &&
              !this.actionContext.selectedComponentType[`@origin`]
            ) {
              // - actions in writable subcomponent
              menu.push(
                {
                  name: "addVariable",
                  title: "Add variable",
                  icon: "ks-variable-add",
                },
                {
                  name: "addEndpoint",
                  title: "Add endpoint",
                  icon: "ks-endpoint-add",
                },
                {
                  name: "addVolume",
                  title: "Add volume",
                  icon: "mdi-database-plus-outline",
                },
                {
                  name: "export",
                  title: "Export component",
                  icon: "mdi-download",
                },
                {
                  name: "remove",
                  title: "Remove component",
                  icon: "mdi-trash-can-outline",
                }
              );
            } else {
              // - export action
              menu.push({
                name: "export",
                title: "Export component",
                icon: "mdi-download",
              });
            }
          } else if (
            this.actionContext.selectedComponentType.type == "composite"
          ) {
            // - if composite subcomponent
            if (this.actionContext.selectedComponentType[`@icon`])
              this.actionContext.selectedIcon =
                "$" + this.actionContext.selectedComponentType[`@icon`];
            else this.actionContext.selectedIcon = "ks-composite";

            if (!this.actionContext.selectedComponentType[`@opaque`])
              menu.push({
                name: "open",
                title: "Open composite",
                //icon: "mdi-open-in-app",
                icon: "ks-composite-open",
              });
            // - export action
            menu.push({
              name: "export",
              title: "Export component",
              icon: "mdi-download",
            });
            if (
              this.currentRoute &&
              this.myMode == "write" &&
              !this.actionContext.selectedComponentType[`@origin`]
            ) {
              menu.push({
                name: "remove",
                title: "Remove composite",
                icon: "mdi-trash-can-outline",
              });
            }
          }
        } else if (this.actionContext.selectedType == "connector") {
          // if connector has been selected
          let route = this.route(
            this.currentRoute,
            this.actionContext.selectedId
          );
          this.actionContext.selectedComponentType =
            this.findComponentByRoute(route);
          this.actionContext.selectedChild = this.findComponentByPath(
            this.componentPath
          ).connectors[this.actionContext.selectedId];

          if (this.actionContext.selectedComponentType[`@icon`])
            this.actionContext.selectedIcon =
              "$" + this.actionContext.selectedComponentType[`@icon`];
          else this.actionContext.selectedIcon = "mdi-circle-outline";

          if (
            this.myMode == "write" &&
            !this.actionContext.selectedComponentType[`@origin`]
          ) {
            menu.push({
              name: "remove",
              title: "Remove connector",
              icon: "mdi-trash-can-outline",
            });
          }
        } else if (this.actionContext.selectedType == "component") {
          // if container component has been selected
          this.actionContext.selectedIcon = "ks-composite";
          this.actionContext.selectedComponentType = this.findComponentByRoute(
            this.currentRoute
          );
        } else if (
          this.actionContext.selectedType == "connector-link" ||
          this.actionContext.selectedType == "link"
        ) {
          // if container component has been selected
          this.actionContext.selectedData = opts.selectedData;
          this.actionContext.selectedIcon = "mdi-arrow-right";
          menu.push({
            name: "remove",
            title: "Remove link",
            icon: "mdi-trash-can-outline",
          });
        }

        if (menu && menu.length) this.$set(this.selectedAction, "menu", menu);
        else this.$delete(this.selectedAction, "menu");

        // Load toolbar only if we have changed the route
        this.loadToolbar();
      }

      // Load properties panel, even if route has not changed, because
      // we may have been selected a different target
      this.loadProperties(
        opts.selectedPath ? { active: opts.selectedPath } : null
      );
    },

    /**
     * Resolve the specified property value, beginning from the specified
     * source and searching down in the hierarchy of components.
     *
     * @param {string} route - The subcomponent/connector route
     * @param {string} name - The property name (or path to property)
     * @param {Object} [opts] - Additional options
     * @param {boolean} opts.startFromComponent - Start from component instead of
     *                                            subcomponent
     * @param {boolean} opts.match - Determines when the search in the hierarchy finishes.
     *                               If 'first' (default value) then stop at the first match.
     *                               If 'last', then stop at the last match.
     *                               If 'merge', and the property resolves to an object then
     *                               search all the hierarchy down and merge all found properties,
     *                               taking precedence the first values found
     *                               If 'enumerate', then keep track of all found values
     */
    getOnCascade(route, name, opts) {
      this.$util.log(
        `[ComponentModel] getOnCascade(${route},${name},${JSON.stringify(
          opts
        )})`
      );

      opts = opts || {};
      opts.match = opts.match || "first";

      let names = name.split(this.$util.constants.PATH_SEPARATOR);

      let resolvedValue;
      if (!opts.startFromComponent) {
        // - resolve first the subcomponent/connector reference
        let parentRoute = this.parentRoute(route);
        let child = this.routeChild(route);

        let parentComponent = this.findComponentByRoute(parentRoute);
        if (
          parentComponent &&
          ((parentComponent.subcomponents &&
            parentComponent.subcomponents[child]) ||
            (parentComponent.connectors && parentComponent.connectors[child]))
        ) {
          // jump to property within this subcomponent/connector
          let value =
            (parentComponent.subcomponents &&
              parentComponent.subcomponents[child]) ||
            (parentComponent.connectors && parentComponent.connectors[child]);
          for (let subname of names) {
            value = value[subname];
            if (!value) break;
          }

          if (value && opts.match == "first") {
            // if return first match we are done
            return {
              route: route,
              id: names.join(this.$util.constants.PATH_SEPARATOR),
              value: value,
            };
          } else if (
            value &&
            (opts.match == "merge" || opts.match == "enumerate")
          ) {
            // if we have to merge then accumulate value and
            // continue all the way down
            resolvedValue = {
              route: [route], // keep all matching routes
              id: [names.join(this.$util.constants.PATH_SEPARATOR)],
              value: [value],
            };
          }
        } else {
          throw new Error(
            `Unable to resolve child ${child} in component ${this.route2Path(
              parentRoute
            )}`
          );
        }
      }

      let component = this.findComponentByRoute(route);
      while (component) {
        // jump to property within this component
        let value = component;
        let parentValue;
        for (let subname of names) {
          parentValue = value;
          value = value[subname];
          if (!value) break;
        }

        if (value && opts.match == "first") {
          // end of journey, firt match found
          return {
            route: route,
            id: names.join(this.$util.constants.PATH_SEPARATOR),
            value: value,
          };
        } else if (value && !value.mapping) {
          // end of journey, value found and no more mappings
          // - if accumulate then merge
          if (resolvedValue) {
            return {
              route: resolvedValue.route.concat(route),
              id: resolvedValue.id.concat(
                names.join(this.$util.constants.PATH_SEPARATOR)
              ),
              value:
                opts.match == "enumerate"
                  ? resolvedValue.value.concat(value)
                  : _.assignWith(
                      {},
                      ...resolvedValue.value.concat(value).reverse(),
                      (objValue, srcValue) => {
                        if (srcValue == undefined || srcValue == "")
                          return objValue;
                        else return srcValue;
                      }
                    ),
            };
          } else {
            // - otherwise return last found value
            return {
              route: route,
              id: names.join(this.$util.constants.PATH_SEPARATOR),
              value: value,
            };
          }
        } else if (
          (value && value.mapping) || // required for objects searching ...
          (parentValue && parentValue.mapping)
        ) {
          // we can continue the journey, mapping found
          // - accumulate value
          if (opts.match == "merge" || opts.match == "enumerate") {
            resolvedValue = {
              route: resolvedValue
                ? resolvedValue.route.concat(route)
                : [route],
              id: resolvedValue
                ? resolvedValue.id.concat(
                    names.join(this.$util.constants.PATH_SEPARATOR)
                  )
                : [names.join(this.$util.constants.PATH_SEPARATOR)],
              value: resolvedValue
                ? resolvedValue.value.concat(value)
                : [value],
            };
          }

          // look for next jumping
          let [childId, id] = (value || parentValue).mapping.split(
            this.$util.constants.MAPPING_SEPARATOR
          );
          names[value ? names.length - 1 : names.length - 2] = id;

          // - look for child in both subcomponents/connectors
          if (component.subcomponents && component.subcomponents[childId]) {
            route = this.route(route, childId);
            value = component.subcomponents[childId];
          } else if (component.connectors && component.connectors[childId]) {
            route = this.route(route, childId);
            value = component.connectors[childId];
          } else {
            throw new Error(
              `Unable to resolve property ${names.join(
                this.$util.constants.PATH_SEPARATOR
              )} mapping ${
                (value || parentValue).mapping
              } in component ${this.route2Path(route)}`
            );
          }
          // mapping found!
          for (let subname of names) {
            value = value[subname];
            if (!value) break;
          }
          if (value && opts.match == "first") {
            return {
              route: route,
              id: names.join(this.$util.constants.PATH_SEPARATOR),
              value: value,
            };
          } else if (
            value &&
            (opts.match == "merge" || opts.match == "enumerate")
          ) {
            // accumulate value
            resolvedValue = {
              route: resolvedValue
                ? resolvedValue.route.concat(route)
                : [route],
              id: resolvedValue
                ? resolvedValue.id.concat(
                    names.join(this.$util.constants.PATH_SEPARATOR)
                  )
                : [names.join(this.$util.constants.PATH_SEPARATOR)],
              value: resolvedValue
                ? resolvedValue.value.concat(value)
                : [value],
            };
          }
          // - jump to next component type
          component = this.findComponentByRoute(route);
        } else {
          return {
            path: null,
            id: null,
            value: null,
          };
        }
      }
    },

    /**
     * Make reactive recursively
     *
     * @param {Object} parent - The parent where the reactive properties must be registered
     * @param {Object} obj - The properties to make reactive
     */
    makeReactive(parent, obj) {
      _.each(obj, (val, prop) => {
        if (Array.isArray(val)) {
          this.$set(parent, prop, []);
          val.forEach((item) => {
            if (typeof item == "object") {
              let reactiveItem = {};
              parent[prop].push(reactiveItem);
              this.makeReactive(reactiveItem, item);
            } else {
              parent[prop].push(item);
            }
          });
        } else if (typeof val == "object") {
          this.$set(parent, prop, {});
          this.makeReactive(parent[prop], val);
        } else {
          this.$set(parent, prop, val);
        }
      });
    },
    /**
     * Generate a unique identifier
     */
    uuid() {
      this.$util.log(`[ComponentModel] uuid()`);
      /*let uuid = String(Date.now()) + Math.trunc(Math.random() * 1000);
      return uuid;*/
      return common.uuid();
    },

    /**
     * Generate a unique name taking as basis the prefix parameter.
     * To that end, the names paramenter is checked.
     *
     * @param {string} prefix - The prefix
     * @param {Object|Array} allNames - The map/s
     * @return {string} The unique name
     */
    uniqueName(prefix, ...allNames) {
      this.$util.log(`[ComponentModel] uniqueName(${prefix})`);
      let name = prefix;
      let i = 0;
      for (let names of allNames) {
        while (
          _.find(
            names,
            (entry, key) =>
              entry == name || key == name || entry[`@name`] == name
          )
        ) {
          i++;
          name = `${prefix}${i}`;
        }
      }
      return name;
    },

    /**
     * Add a new component type to the main components table.
     *
     * @param {string} path - The context component path
     * @param {Object} opts - Additional options
     * @param {string} opts.type - The component type ('basic', 'composite')
     * @param {string} opts.name - The component name
     * @return {Object} The added component model
     */
    addComponent(path, opts) {
      this.$util.log(
        `[ComponentModel] addComponent(${path}, ${JSON.stringify(opts)})`
      );
      if (!opts)
        throw new Error("Error adding component: missing component model");
      if (!opts.type)
        throw new Error("Error adding component: missing component type");
      opts.name = opts.name || "Component";
      opts.id = opts.id || this.uuid();

      let container = this.findComponentByPath(path);
      let model = { type: opts.type };

      model[`@id`] = `${path}${this.$util.constants.PATH_SEPARATOR}${opts.id}`;
      model[`@name`] = this.uniqueName(
        opts.name,
        _.map(
          container.imports,
          (type) => this.findComponentByPath(this.componentPath, type)[`@name`]
        )
      );
      model.cardinality = opts.cardinality || "";
      model.schedule = opts.schedule || "";
      model.variables = opts.variables || {};
      model.volumes = opts.volumes || {};
      model.endpoints = opts.endpoints || {};
      if (opts.type == "basic") {
        model.runtime = opts.runtime || "docker";
        model.source = opts.source || "";
        model.durability = opts.durability || "";
        model.events = {
          init: "",
          cfg: "",
          ping: "",
          destroy: ""
        }
      } else if (opts.type == "composite") {
        model.imports = [];
        model.subcomponents = {};
        model.connectors = {};
      }
      this.$set(this.components, model[`@id`], {});
      let component = this.findComponentByPath(model[`@id`]);
      this.makeReactive(component, model);
      container.imports.push(opts.id);
      return component;
    },

    /**
     * Add a new subcomponent/component to the current container.
     *
     * @param {Object} [opts] - Additional  options
     * @param {string} opts.type - Component type ('basic','composite', or another existent
     *                             within the current container)
     * @param {string} opts.name - Subcomponent name
     * @param {string} opts.layout - Subcomponent layout
     * @return {Object} - The added subcomponent
     */
    addSubcomponent(opts) {
      this.$util.log(`[ComponentModel] addSubcomponent(${JSON.stringify(opts)})`);
      opts = opts || {};
      opts.type = opts.type || "basic";

      let component, componentId;
      if (opts.type == "basic" || opts.type == "composite") {
        // - create new component
        componentId = this.uuid();
        let model = {
          type: opts.type,
          name: opts.name,
          id: componentId,
        };
        component = this.addComponent(this.componentPath, model);
      } else {
        // - obtain existent component
        componentId = opts.type;
        component = this.findComponentByPath(this.componentPath, opts.type);
      }

      // - add subcomponent to container
      let container = this.findComponentByPath(this.componentPath);
      let subcompId = this.uuid();
      this.$set(container.subcomponents, subcompId, {});
      this.$set(container.subcomponents[subcompId], `@id`, subcompId);
      // - generate @name: check uniqueness in both subcomponents and connectors
      this.$set(
        container.subcomponents[subcompId],
        `@name`,
        this.uniqueName(
          component[`@name`],
          container.subcomponents,
          container.connectors
        )
      );
      this.$set(container.subcomponents[subcompId], "type", componentId);
      this.$set(container.subcomponents[subcompId], "variables", {});
      this.$set(container.subcomponents[subcompId], "volumes", {});

      // - set layout of new subcomponent
      if (opts.layout)
        this.$set(container.subcomponents[subcompId], `@layout`, opts.layout);

      return container.subcomponents[subcompId];
    },

    /**
     * Remove the specified subcomponent/component type from the current container.
     *
     * @param {string} subcomponentId - The subcomponent to remove
     */
    removeSubcomponent(subcomponentId) {
      this.$util.log(`[ComponentModel] removeSubcomponent(${subcomponentId})`);

      // - if not subcomponent, then take selected subcomponent
      subcomponentId = subcomponentId || this.actionContext.selectedId;

      if (!subcomponentId)
        throw new Error("Error removing subcomponent: subcomponent not found");

      // Look for subcomponent
      let container = this.findComponentByPath(this.componentPath);
      let subcomp = container.subcomponents[subcomponentId];
      if (!subcomp)
        throw new Error(`Unable to find subcomponent ${subcomponentId}`);

      // Remove recursively any variable/volume/endpoint based on this
      // subcomponent
      let subcomponentRoute = this.route(this.currentRoute, subcomponentId);
      let subcomponentPath = this.route2Path(subcomponentRoute);
      let subcomponentType = this.findComponentByPath(subcomponentPath);

      _.each(subcomponentType.variables, (variable, varId) => {
        this.removeOnCascade(subcomponentRoute, `variables/${varId}`);
      });
      _.each(subcomponentType.volumes, (vol, volId) => {
        this.removeOnCascade(subcomponentRoute, `volumes/${volId}`);
      });
      _.each(subcomponentType.endpoints, (ep, epId) => {
        this.removeOnCascade(subcomponentRoute, `endpoints/${epId}`);
      });

      // Remove any link connected to this subcomponent
      // (and connector recursively if required)

      _.each(container.connectors, (con, conId) => {
        let input, output, subcomp, ep;
        // - remove the inputs the subcomponent is invoved in
        while (
          (input = con.inputs.find((input) => {
            [subcomp, ep] = input.split(this.$util.constants.MAPPING_SEPARATOR);
            return subcomp == subcomponentId;
          }))
        ) {
          //con.inputs.splice(index, 0);
          this.removeLink({ subcomponent: subcomp, endpoint: ep }, conId);
        }

        // - remove the outputs the subcomponent is invoved in
        while (
          (output = con.outputs.find((output) => {
            [subcomp, ep] = output.split(
              this.$util.constants.MAPPING_SEPARATOR
            );
            return subcomp == subcomponentId;
          }))
        ) {
          //con.outputs.splice(index, 0);
          this.removeLink(conId, { subcomponent: subcomp, endpoint: ep });
        }

        // - if orphan "link" connector then delete
        if (con.type == "Link" && (!con.inputs.length || !con.outputs.length))
          this.removeConnector(con[`@id`]);
      });

      // Remove subcomponent
      this.$delete(container.subcomponents, subcomponentId);

      // Remove type if not recursvie and no more subcomponents/connectors
      if (subcomp.type != ".") {
        let removeType = true;
        _.each(container.subcomponents, (otherSubcomp) => {
          if (subcomp.type == otherSubcomp.type) removeType = false;
        });
        _.each(container.connectors, (otherCon) => {
          if (subcomp.type == otherCon.type) removeType = false;
        });
        if (removeType) {
          // Remove from components
          this.$delete(this.components, subcomponentPath);

          // Remove from imports
          let index = container.imports.indexOf(subcomp.type);
          container.imports.splice(index, 1);

          // Remove all subcomponents recursively
          _.each(this.components, (comp, compPath) => {
            if (
              compPath != subcomponentPath &&
              compPath.startsWith(subcomponentPath)
            )
              this.$delete(this.components, compPath);
          });
        }
      }

      if (this.actionContext.selectedId == subcomponentId) {
        this.actionContext.selectedType = null;
        this.actionContext.selectedId = null;
        this.actionContext.selectedChild = null;
        this.actionContext.selectedComponentType = null;
      }
    },

    /**
     * Add a connector to the current container.
     *
     * @param {Object} opts - Options
     * @param {string} opts.type - Component type (recall connectors
     *                 are modeled by regular components)
     * @param {string} opts.name - Connector name
     * @param {string} opts.layout - Connector layout
     * @return {Object} The added connector
     */
    addConnector(opts) {
      this.$util.log(`[ComponentModel] addConnector(${JSON.stringify(opts)})`);
      opts = opts || {};
      if (!opts.type) throw new Error("Error adding connector: unknown type");

      let componentType;
      if (opts.type == "Link") componentType = { "@name": "Link" };
      else
        componentType = this.findComponentByPath(this.componentPath, opts.type);
      if (!componentType)
        throw new Error(
          `Error adding connector: connector type ${opts.type} not found`
        );

      // - add connector to container
      let container = this.findComponentByPath(this.componentPath);
      let conId = this.uuid();
      this.$set(container.connectors, conId, {});
      this.$set(container.connectors[conId], `@id`, conId);
      this.$set(
        container.connectors[conId],
        `@name`,
        this.uniqueName(
          componentType[`@name`],
          container.connectors,
          container.subcomponents
        )
      );
      this.$set(container.connectors[conId], `type`, opts.type);
      this.$set(container.connectors[conId], `variables`, {});
      this.$set(container.connectors[conId], `volumes`, {});
      this.$set(container.connectors[conId], `inputs`, []);
      this.$set(container.connectors[conId], `outputs`, []);
      // - set layout of new subcomponent
      if (opts.layout)
        this.$set(container.connectors[conId], `@layout`, opts.layout);

      return container.connectors[conId];
    },

    /**
     * Removes the specified connector.
     *
     * @param {string} connectorId - The connector identifier.
     */
    removeConnector(connectorId) {
      this.$util.log(`[ComponentModel] removeConnector(${connectorId})`);

      // - if no connector, then take selected connector
      connectorId = connectorId || this.actionContext.selectedId;

      if (!connectorId)
        throw new Error("Error removing connector: connector not found");

      // Look for connector
      let container = this.findComponentByPath(this.componentPath);
      let connector = container.connectors[connectorId];
      if (!connector)
        throw new Error(`Unable to find connector ${connectorId}`);

      if (connector.type != "Link") {
        // Remove recursively any variable/volume/endpoint based on this
        // connector
        let connectorRoute = this.route(this.currentRoute, connectorId);
        let connectorPath = this.route2Path(connectorRoute);
        let connectorType = this.findComponentByPath(connectorPath);

        _.each(connectorType.variables, (variable, varId) => {
          this.removeOnCascade(connectorRoute, `variables/${varId}`);
        });
        _.each(connectorType.volumes, (vol, volId) => {
          this.removeOnCascade(connectorRoute, `volumes/${volId}`);
        });
        _.each(connectorType.endpoints, (ep, epId) => {
          this.removeOnCascade(connectorRoute, `endpoints/${epId}`);
        });

        // If connector is composite entrypoint then remove entrypoint
        let containerEp = _.find(
          container.endpoints,
          (ep) => ep.mapping == connectorId
        );
        if (containerEp) {
          this.$delete(container.endpoints, containerEp[`@id`]);
        }

        // Remove type if no more subcomponents/connectors
        let removeType = true;
        _.each(container.subcomponents, (otherSubcomp) => {
          if (connector.type == otherSubcomp.type) removeType = false;
        });
        _.each(container.connectors, (otherCon) => {
          if (connector.type == otherCon.type) removeType = false;
        });
        if (removeType) {
          // Remove from components
          this.$delete(this.components, connectorPath);

          // Remove from imports
          let index = container.imports.indexOf(connector.type);
          container.imports.splice(index, 1);

          // Remove all subcomponents recursively
          _.each(this.components, (comp, compPath) => {
            if (compPath != connectorPath && compPath.startsWith(connectorPath))
              this.$delete(this.components, compPath);
          });
        }

        // [TODO]
        // Check whether the connector has been published
        // If it is the case remove recursively up
      }

      // Remove connector
      this.$delete(container.connectors, connectorId);

      if (this.actionContext.selectedId == connectorId) {
        this.actionContext.selectedType = null;
        this.actionContext.selectedId = null;
        this.actionContext.selectedChild = null;
        this.actionContext.selectedComponentType = null;
      }
    },

    /**
     * Add a new link.
     *
     * @param {Object|string} src - The source (if Object then {subcomponent, endpoint})
     * @param {Object|string} dst - The destination (if Object then {subcomponent, endpoint})
     */
    addLink(src, dst) {
      this.$util.log(
        `[ComponentModel] addLink(${JSON.stringify(src)}, ${JSON.stringify(
          dst
        )})`
      );
      if (_.isString(src)) {
        // - case connector -> component
        this.findComponentByPath(this.componentPath).connectors[
          src
        ].outputs.push(
          `${dst.subcomponent}${this.$util.constants.MAPPING_SEPARATOR}${dst.endpoint}`
        );
      } else if (_.isString(dst)) {
        // - case component -> connector
        this.findComponentByPath(this.componentPath).connectors[
          dst
        ].inputs.push(
          `${src.subcomponent}${this.$util.constants.MAPPING_SEPARATOR}${src.endpoint}`
        );
      }
    },

    /**
     * Remove link.
     *
     * @param {Object|string} src - The source (if Object then {subcomponent, endpoint})
     * @param {Object|string} dst - The destination (if Object then {subcomponent, endpoint})
     */
    removeLink(src, dst) {
      this.$util.log(
        `[ComponentModel] removeLink(${JSON.stringify(src)}, ${JSON.stringify(
          dst
        )})`
      );
      let container = this.findComponentByPath(this.componentPath);
      if (_.isString(src)) {
        // - case connector -> component

        //  if link connects a composite entrypoint to a component
        //   then remove entrypoint
        let con = _.find(container.connectors, (con) => con[`@id`] == src);
        if (con) {
          // check if entrypoint
          let containerEp = _.find(
            container.endpoints,
            (ep) => ep.mapping == con[`@id`]
          );
          if (containerEp && con.outputs.length == 1) {
            // remove entrypoint
            this.$delete(container.endpoints, containerEp[`@id`]);
          }
        }

        let index = container.connectors[src].outputs.indexOf(
          `${dst.subcomponent}${this.$util.constants.MAPPING_SEPARATOR}${dst.endpoint}`
        );
        if (index != -1) container.connectors[src].outputs.splice(index, 1);
      } else if (_.isString(dst)) {
        // - case component -> connector
        let index = container.connectors[dst].inputs.indexOf(
          `${src.subcomponent}${this.$util.constants.MAPPING_SEPARATOR}${src.endpoint}`
        );
        if (index != -1) container.connectors[dst].inputs.splice(index, 1);
      }
    },

    /**
     * Remove the selected element.
     */
    removeSelected() {
      this.$util.log(
        `[ComponentModel] removeSelected(${this.actionContext.selectedId})`
      );
      if (this.actionContext.selectedType == "subcomponent") {
        this.removeSubcomponent(this.actionContext.selectedId);
      } else if (this.actionContext.selectedType == "connector") {
        this.removeConnector(this.actionContext.selectedId);
      }
    },

    /**
     * Sets the specified property on cascade all the way up
     * in the components hierarchy. The starting point is
     * a given component type.
     *
     * @param {string} route - The subcomponent/connector route
     * @param {string} name - The path to the property
     * @param {any} value - The value to set
     */
    setOnCascade(route, name, value) {
      this.$util.log(`[ComponentModel] setOnCascade(${route},${name},${value})`);

      // - decompose path to property
      let [colName, elemId, propName] = name.split("/");

      let componentPath = this.route2Path(route);
      if (
        !this.findComponentByPath(componentPath) ||
        !this.findComponentByPath(componentPath)[colName] ||
        !this.findComponentByPath(componentPath)[colName][elemId]
      )
        throw new Error(
          `Error setting on cascade: unable to find property to path ${name} in component ${componentPath}`
        );

      // - fix the property in the starting component
      this.$set(
        this.findComponentByPath(componentPath)[colName][elemId],
        propName,
        value
      );
      this.$util.log(`- changed in component ${componentPath}`);

      let referredIds = [elemId];
      while (referredIds.length) {
        // - get parent and look for subcomponents/connectors pointing to
        //   referred ids
        let referrers = [];
        let parentPath = this.route2Path(this.parentRoute(route));
        let parent = this.findComponentByPath(parentPath);
        let type = componentPath
          .split(this.$util.constants.PATH_SEPARATOR)
          .slice(-1);

        _.forEach(parent.subcomponents, (subcomp, subcompId) => {
          // - look for subcomponents of that type
          //   which may refer to the element
          if (subcomp.type == type) {
            if (subcomp[colName]) {
              for (let id in subcomp[colName]) {
                if (referredIds.includes(id)) {
                  this.$set(subcomp[colName][id], propName, value);
                  this.$util.log(`- changed in subcomponent ${subcomp[`@id`]}`);
                }
              }
            }
            _.forEach(referredIds, (referredId) => {
              referrers.push(
                `${subcompId}${this.$util.constants.MAPPING_SEPARATOR}${referredId}`
              );
            });
          }
        });
        _.forEach(parent.connectors, (con, conId) => {
          // - look for connectors of that type
          //   which may refer to the element
          if (con.type == type) {
            if (con[colName]) {
              for (let id in con[colName]) {
                if (referredIds.includes(id)) {
                  this.$set(con[colName][id], propName, value);
                  this.$util.log(`- changed in connector ${con[`@id`]}`);
                }
              }
            }
            _.forEach(referredIds, (referredId) => {
              referrers.push(
                `${conId}${this.$util.constants.MAPPING_SEPARATOR}${referredId}`
              );
            });
          }
        });
        // - now we see which elements are published
        //   by parent
        referredIds = [];
        if (parent[colName]) {
          _.forEach(parent[colName], (elem, elemId) => {
            if (referrers.includes(elem.mapping)) {
              referredIds.push(elem[`@id`]);
              this.$set(parent[colName][elemId], propName, value);
              this.$util.log(`- changed in component ${parent[`@id`]}`);
            }
          });
        }
        componentPath = parentPath;
      }
    },

    /**
     * Removes the specified element from the specified collection.
     * The elements is remove recursively all the way up, considering
     * the hierarchy of components.
     *
     * @param {string} route - The subcomponent/connector route
     * @param {string} name - The property path
     */
    removeOnCascade(route, name) {
      this.$util.log(`[ComponentModel] removeOnCascade(${route},${name})`);

      let [colName, elemId] = name.split("/");

      let referredIds = [elemId];
      let componentPath = this.route2Path(route);
      while (referredIds.length) {
        this.$util.log(`referreds=${JSON.stringify(referredIds)}`);

        // - get parent and look for subcomponents pointing to
        //   referred ids
        let referrers = [];
        route = this.parentRoute(route);
        let parentPath = this.route2Path(route);
        let parent = this.findComponentByPath(parentPath);
        this.$util.log(componentPath);
        let type = componentPath
          .split(this.$util.constants.PATH_SEPARATOR)
          .slice(-1);

        _.forEach(parent.subcomponents, (subcomp, subcompId) => {
          // - look for subcomp onents of that type
          //   which may refer to the element
          if (subcomp.type == type) {
            if (subcomp[colName]) {
              for (let id in subcomp[colName]) {
                if (referredIds.includes(id)) {
                  this.$delete(subcomp[colName], id);
                }
              }
            }
            _.forEach(referredIds, (referredId) => {
              referrers.push(
                `${subcompId}${this.$util.constants.MAPPING_SEPARATOR}${referredId}`
              );
            });
          }
        });

        _.forEach(parent.connectors, (con, conId) => {
          // - look for connectors of that type
          //   which may refer to the element
          if (con.type == type) {
            if (con[colName]) {
              for (let id in con[colName]) {
                if (referredIds.includes(id)) {
                  this.$delete(con[colName], id);
                }
              }
            }
            _.forEach(referredIds, (referredId) => {
              referrers.push(
                `${conId}${this.$util.constants.MAPPING_SEPARATOR}${referredId}`
              );
            });
          }
        });
        this.$util.log(`referrers=${JSON.stringify(referrers)}`);

        // - now we see which elements are published
        //   by parent
        referredIds = [];
        if (parent[colName]) {
          _.forEach(parent[colName], (elem, elemId) => {
            if (referrers.includes(elem.mapping)) {
              referredIds.push(elem[`@id`]);
              this.$delete(parent[colName], elemId);
            }
          });
        }
        componentPath = parentPath;
      }
    },

    /**
     * Obtains the component with the specified path.
     *
     * @param  {...String} paths - The paths
     */
    findComponentByPath(...paths) {
      return common.findComponentByPath(this.components, ...paths);
    },

    /**
     * Obtains the component associated to the specified route.
     * A route is a sequence of subcomponents/connectors.
     *
     * @param  {...String} routes - The routes
     */
    findComponentByRoute(...routes) {
      return common.findComponentByRoute(this.components, ...routes);
    },

    /**
     * Obtains the parent route.
     *
     * @param {...String} subroutes - The route
     */
    parentRoute(...subroutes) {
      return common.parentRoute(...subroutes);
    },

    /**
     * Obtains the last child of the specified route.
     */
    routeChild(...subroutes) {
      return common.routeChild(...subroutes);
    },

    /**
     * Composes a route given a sequence of subroutes
     *
     * @param  {...String} subroutes  - The sequence of subroutes
     */
    route(...subroutes) {
      return common.route(...subroutes);
    },

    /**
     * Transforms the given route to the component path beginning
     * from the specified component path.
     *
     * @param {String} routes - The route to translate
     */
    route2Path(...routes) {
      return common.route2Path(this.components, ...routes);
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.component-model-container {
  /*height: 100%;*/
  display: flex;
  flex-direction: column;
  padding-bottom: 5px;
  overflow: hidden !important;
}
.component-model-content {
  flex-grow: 1;
  display: flex;
  flex-direction: row;
  /*margin-bottom: 10px;
  /*margin-bottom: 10px;
  /*height: 200px;
  max-height: 200px;
  /*height: 100%;
  width: 100%;
  max-width: 100%;*/
}
/*
.component-model-viewer {
  flex-grow: 1;
  overflow: hidden;
}*/
.component-model-propertiesShow {
  display: flex;
  height: 100%;
  align-items: center;
}
.component-model-propertiesPanel {
  display: flex;
  flex-direction: column;
  min-width: 300px;
  max-width: 300px;
  overflow: auto;
}
.component-model-propertiesToolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 5px 10px 10px 5px;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
}
</style>
