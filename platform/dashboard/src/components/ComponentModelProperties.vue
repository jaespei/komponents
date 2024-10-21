<template>
  <v-expansion-panels
    v-if="view.type == 'super-group'"
    :id="view.id"
    :value="activeIndex != -1 ? activeIndex : null"
    accordion
  >
    <v-expansion-panel
      v-for="child in visibleChildren(model)"
      :key="child.id"
      :id="child.id"
    >
      <v-expansion-panel-header>
        <v-icon style="flex-grow: 0; padding-right: 10px">
          {{ child.icon }} </v-icon
        >{{ child.title }}
      </v-expansion-panel-header>
      <v-expansion-panel-content>
        <component-model-properties
          v-if="child.type.endsWith('group')"
          :view="child"
          :model="model"
          :active="activeChild"
          @change="change"
        ></component-model-properties>
        <component-model-property
          v-else
          :view="child"
          :model="model"
          @change="change"
        ></component-model-property>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>

  <v-sheet v-else-if="view.type == 'group'">
    <template v-for="subview in visibleChildren(model)">
      <component-model-properties
        v-if="subview.type.endsWith('group')"
        :key="subview.id"
        :view="subview"
        :model="model"
        :active="activeChild"
        @change="change"
      ></component-model-properties>
      <component-model-property
        v-else
        :key="subview.id"
        :view="subview"
        :model="model"
        @change="change"
      ></component-model-property>
    </template>
  </v-sheet>

  <v-sheet v-else-if="view.type == 'list-group'">
    <v-btn
      v-if="view.mode != 'read'"
      plain
      block
      style="margin-bottom: 10px"
      @click="addItem()"
      >Add<v-icon right>mdi-plus</v-icon></v-btn
    >
    <v-list-group
      v-for="(submodel, key) in model[view.path]"
      :value="activeParent == key"
      :id="`${view.id}/${key}`"
      :key="key"
      style="
        border: 1px solid lightgray;
        border-radius: 5px;
        margin-bottom: 5px;
      "
    >
      <template v-slot:activator>
        <v-list-item-icon
          :style="
            view.iconPath && submodel[view.iconPath] ? 'margin-right: 5px;' : ''
          "
          v-if="view.mode != 'read'"
          @click.stop="removeItem(key)"
        >
          <v-icon>mdi-close</v-icon>
        </v-list-item-icon>
        <v-list-item-icon
          :style="
            view.iconPath && submodel[view.iconPath] ? 'margin-right: 5px;' : ''
          "
          v-if="view.iconPath && submodel[view.iconPath]"
        >
          <v-icon>{{ submodel[view.iconPath] }}</v-icon>
        </v-list-item-icon>
        <v-list-item-title class="text-truncate">
          <!--v-icon v-if="view.iconPath && submodel[view.iconPath]" style="float:left;  ">{{ submodel[view.iconPath] }}</v-icon-->
          {{ submodel[view.idPath] }}
        </v-list-item-title>
      </template>
      <v-list-item
        v-for="subview in visibleChildren(submodel)"
        :key="subview.id"
      >
        <v-list-item-content>
          <component-model-properties
            v-if="subview.type.endsWith('group')"
            :view="subview"
            :model="model[view.path][key]"
            :active="activeChild"
            @change="updateItem(key, $event)"
          ></component-model-properties>
          <component-model-property
            v-else
            :view="subview"
            :model="model[view.path][key]"
            @change="updateItem(key, $event)"
          ></component-model-property>
        </v-list-item-content>
      </v-list-item>
    </v-list-group>
  </v-sheet>

  <v-sheet v-else-if="view.type == 'conditional-group'">
    <component-model-property
      v-if="view.condition.type"
      :view="view.condition"
      :model="model"
      @change="condition"
    ></component-model-property>
    <template v-for="subview in validChildren">
      <component-model-properties
        :key="subview.id"
        v-if="subview.type.endsWith('group')"
        :view="subview"
        :model="model"
        @change="change"
      ></component-model-properties>
      <component-model-property
        :key="subview.id"
        v-else
        :view="subview"
        :model="model"
        @change="change"
      ></component-model-property>
    </template>

  </v-sheet>



  <div v-else></div>
</template>

<script>
import ComponentModelProperty from "./ComponentModelProperty.vue";
import _ from "lodash";

/**
 * Component Model Properties Panel
 * Inputs:
 * - view: a spec about how the properties should be rendered
 * - model: the component model
 * - pathSeparator: for keeping track of accessed paths
 * 
 * The component accepts a specific template syntax for the view input.
 * 
 * View ::= PropertiesSpec | PropertySpec
 * 
 * PropertiesSpec ::= SuperGroupSpec | GroupSpec | ListGroupSpec | ConditionalGroupSpec
 * SuperGroupSpec, GroupSpec ::= { 
 *   id: string, 
 *   type: "super-group"|"group",
 *   title: string,
 *   icon: string,
 *   active: string,  (path to active field)
 *   children: [ PropertiesSpec | PropertySpec ]
 * }
 * ListGroupSpec ::= inherits SuperGroupSpec and {  (dynamic list of items)
 *   type: "list-group",
 *   mode: "read" | "write", (determines whether elements can be added/removed)
 *   idPath: string,         (the path where children contain the id)
 *   icon: string,        
 *   iconPath: string,    (the path where children contain an icon)
 *   default: { string: string } (the default properties when creating new items)
 * }
 * ConditionalGroupSpec ::= inherits from ListGroupSpec and {  (group of elements conditionally shown)
 *   type: "conditional-group",
 *   condition: PropertySpec, (determines the property which contains the value to check)
 *   children: {              (contains the different options to show)
 *     string: PropertiesSpec | PropertySpec
 *   }
 * }
 * 
 * PropertySpec ::= TextSpec | NumberSpec | RangeSpec | CheckSpec | SelectSpec
 * CheckSpec ::= {
 *   id: string, 
 *   type: "check"
 *   title: string,
 *   path: string      (path on the model where data resides)
 *   value: string     (optional, fixed value)
 *   mode: "read" || "write"
 *   modePath: string  (optional, path where the mode is specified; useful for dynamic fields)
 *   info: string      (optional, showing a little message below)
 *   infoPath: string  (optional, path where the info is specified; useful for dynamic fields)
 *   error: string     (optional, showing a little message)
 *   errorPath: string (optional, path where the error is specified; useful for dynamic fields))
 * }
 * RangeSpec ::= inherits CheckSpec and {
 *   type: "range"
 *   title: string ":" string
 * }
 * TextSpec, NumberSpec ::= inherits CheckSpec and {
 *   type: "text"|"number"
 *   validate: {         (validating text with RegExp)
 *     pattern: RegExp,  
 *     message: string   (error message if pattern is not matched)
 *   },
 *   prepend: string (optional, prepend this text to returned value)
 *   append: string (optional, append this text to returned value)
 *   preAction: {   (optional, enable additional actions)
 *     name: string,
 *     icon: string
 *   },
 *   postAction: {   (optional, enable additional actions)
 *     name: string,
 *     icon: string
 *   }
 *   preActionPath: string ":" string (optional, path where the action is specified; useful for dynamic fields))
 *   postActionPath: string ":" string (optional, path where the action is specified; useful for dynamic fields))
 * }
 * SelectSpec ::= inherits TextSpec and {
 *   type: "select",
 *   default: string,
 *   catchAll: string,     (optional, determines the selected value if no matches)
 *   values: [ { title:string, value: string }]
 * }

 * 
 * 
 * 
 */
export default {
  name: "ComponentModelProperties",
  components: {
    ComponentModelProperty,
  },
  props: {
    view: { type: Object },
    model: { type: Object },
    active: { type: String },
    pathSeparator: { type: String, default: "/" },
  },
  data() {
    return {};
  },
  computed: {
    /*visibleChildren() {
      if (this.view.type == "conditional-group") {
        return this.view.children;
      } else
        return _.filter(this.view.children, (child) => {
          if (child.hasOwnProperty("visiblePath") && _.isBoolean(this.model[child.visiblePath]))
            return this.model[child.visiblePath];
          else if (child.hasOwnProperty("visible")) return child.visible;
          else return true;
        });
    },*/
    activeIndex() {
      if (this.view.active) {
        let [path, ...rest] = this.view.active.split("/");
        let index = this.view.children.findIndex((c) => c.id == path);
        /*this.$util.log(
          `[ComponentModelProperties] activeIndex(${this.view.id}) = ${index}`
        );*/
        return index;
      } else return 0;
    },
    activeChild() {
      /*this.$util.log(`[ComponentModelProperties] activeChild()`);*/
      let active = this.active || this.view.active;
      if (active) {
        let [path, ...rest] = active.split("/");
        /*this.$util.log(`[ComponentModelProperties] -> ${rest.join("/")}`);*/
        if (rest.length) return rest.join("/");
      }
      return "";
    },
    activeParent() {
      /*this.$util.log(`[ComponentModelProperties] activeParent()`);*/
      let active = this.active || this.view.active;
      if (active) {
        let [path, ...rest] = active.split("/");
        /*this.$util.log(`[ComponentModelProperties] -> ${path}`);*/
        if (path) return path;
      }
      return "";
    },
    /**
     * In a conditional-group returns the children view satisfying the
     * defined condition.
     */
    validChildren() {
      let children = this.visibleChildren(this.model);
      for (let condition in children) {
        if (
          this.checkCondition(condition, this.model[this.view.condition.path])
        ) {
          //this.$util.log(`[ComponentModelProperties] validChildren(${condition}=true) => ${children[condition]}`);
          return children[condition];
        }
      }
      //this.$util.log(`[ComponentModelProperties] validChildren(catchAll) => ${children[this.view.condition.catchAll]}`);
      
      // catchAll
      if (this.view.condition.catchAll)
        return children[this.view.condition.catchAll];
      else return [];
    },
  },
  created() {},
  methods: {
    log(msg) {
      this.$util.log(msg);
    },
    change(evt) {
      /*this.$util.log(`[ComponentModelProperties] change(${JSON.stringify(evt)})`);*/
      this.$emit("change", evt);
    },
    condition(evt) {
      /*this.$util.log(
        `[ComponentModelProperties] condition(${JSON.stringify(evt)})`
      );*/
      this.$emit("change", evt);
    },
    /**
     * Checks the specified condition agains the specified value.
     *
     * @param {string|RegExp} condition - The condition to evaluate
     * @param {string} value - The value to check
     * @return {boolean} The result of the checking
     */
    checkCondition(condition, value) {
      let re = new RegExp(condition);
      this.$util.log(
        `[ComponentModelProperties] checkCondition(${condition},${value}) = ${re.test(
          value
        )}`
      );
      return re.test(value);
    },
    updateItem(key, evt) {
      /*this.$util.log(
        `[ComponentModelProperties] updateItem(${key}, ${JSON.stringify(evt)})`
      );*/
      evt = Object.assign({}, evt);
      evt.path =
        this.view.path +
        this.pathSeparator +
        key +
        this.pathSeparator +
        evt.path;
      this.$emit("change", evt);
    },
    removeItem(key) {
      /*this.$util.log(`[ComponentModelProperties] removeItem(${key})`);*/
      let path = this.view.path + this.pathSeparator + key;
      this.$emit("change", { type: "remove", path: path });
    },
    addItem() {
      /*this.$util.log(`[ComponentModelProperties] addItem()`);*/
      this.$emit("change", {
        type: "add",
        path: this.view.path,
        value: Object.assign({}, this.view.default),
      });
    },
    visibleChildren(submodel) {
      if (this.view.type.startsWith("conditional-group")) {
        return this.view.children;
      } else
        return _.filter(this.view.children, (child) => {
          if (
            child.hasOwnProperty("visiblePath") &&
            _.isBoolean(submodel[child.visiblePath])
          )
            return submodel[child.visiblePath];
          else if (child.hasOwnProperty("visible")) return child.visible;
          else return true;
        });
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
