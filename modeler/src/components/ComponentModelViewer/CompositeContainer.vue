<template>
  <div
    ref="container"
    :class="{
      'composite-container': true,
      'composite-container-selected': selected,
    }"
  >
    <div class="endpoints">
      <div
        class="endpoint"
        v-for="ep in listEndpoints()"
        :key="ep.id"
        @click="
          $emit('action', {
            type: 'select',
            selectedId: '',
            selectedPath: `endpoints/${ep.id}`,
          })
        "
      >
        <label>{{ ep.name }}</label>
        <svg
          class="endpoint"
          width="20"
          height="20"
          preserveAspectRatio="none"
          viewBox="-10,-10,20,20"
        >
          <polygon
            points="-10,10 0,-10, 10,10"
            :transform="ep.transform"
            style="stroke: black; stroke-width: 1; fill: white"
          />
        </svg>
      </div>
    </div>
    <div v-if="selected" class="composite-container-selector top-left"></div>
    <div v-if="selected" class="composite-container-selector top-right"></div>
    <div v-if="selected" class="composite-container-selector bottom-left"></div>
    <div
      v-if="selected"
      class="composite-container-selector bottom-right"
    ></div>
    <div
      ref="header"
      :style="{ backgroundColor: componentColor }"
      class="composite-container-header"
      @click="$emit('action', { type: 'select', selectedId: '' })"
    >
      {{ component[`@name`] }}
    </div>
    <div ref="body" class="composite-container-body">
      <composite-internals
        :components="components"
        :componentsLayout="componentsLayout"
        :componentsDisplay="componentsDisplay"
        :componentRoute="componentRoute"
        :mode="mode"
        :action="action"
        @action="$emit('action', $event)"
        @change="$emit('change', $event)"
      >
      </composite-internals>
    </div>
  </div>
</template>

<script>
import CompositeInternals from "./CompositeInternals.vue";
import common from "./common";
import _ from "lodash";
import Clay from "clay.js";

/*import _ from "lodash";
import Clay from "clay.js";
import common from "./common";*/

export default {
  name: "CompositeContainer",
  components: {
    CompositeInternals,
  },
  props: {
    components: { type: Object },
    componentsLayout: { type: Object },
    componentsDisplay: { type: Object },
    componentRoute: { type: String },
    action: { type: Object },
    mode: { type: String },
  },
  data() {
    return {
      endpoints: [],
    };
  },
  computed: {
    selected() {
      return (
        this.action &&
        this.action.name == "pointer" &&
        this.action.selectedId == ""
      );
    },
    component() {
      return common.findComponentByRoute(this.components, this.componentRoute);
    },
    componentColor() {
      let layout = this.componentsLayout[common.route2Path(this.components, this.componentRoute)];
      if (layout) return layout.color || common.COLOR_FOREGROUND;
      //return common.COLOR_BACKGROUND;
      return common.COLOR_FOREGROUND;
    }
  },
  watch: {
    componentRoute(value) {
      this.$util.log(`[CompositeInternals] watch.componentRoute(${value})`);
      this.load();
    },
  },
  created() {
    this.$util.log(`[CompositeContainer] created()`);
    window.container = this;
  },
  mounted() {
    this.$util.log(`[CompositeContainer] mounted()`);
    this.load();
  },
  beforeDestroy() {
    this.$util.log(`[CompositeContainer] beforeDestroy()`);
    this.unload();
  },
  methods: {
    listEndpoints() {
      this.$util.log(`[CompositeContainer] listEndpoints()`);
      if (!this.$refs.container) return []; // required because this.$refs is populated after mounted

      /*let inEndpoints = this.endpoints.filter((ep) => ep.type == "in");
      let outEndpoints = this.endpoints.filter((ep) => ep.type == "out");

      // - calculate space between ports
      let diffIn = Math.floor(
        this.$refs.container.offsetHeight / (inEndpoints.length + 1)
      );
      let diffOut = Math.floor(
        this.$refs.container.offsetHeight / (outEndpoints.length + 1)
      );

      let resEndpoints = [];
      let i = 1;
      _.each(inEndpoints, (ep) => {
        resEndpoints.push({
          id: ep[`@id`],
          name: ep[`@name`],
          published: ep[`@published`],
          required: ep[`required`],
          left: -10,          
          top: i++ * diffIn,
        });
      });
      i = 1;
      _.each(outEndpoints, (ep) => {
        resEndpoints.push({
          id: ep[`@id`],
          name: ep[`@name`],
          published: ep[`@published`],
          required: ep[`required`],
          right: -20,
          top: i++ * diffOut,
        });
      });*/
      let diff = Math.floor(
        this.$refs.container.offsetHeight / (this.endpoints.length + 1)
      );
      let resEndpoints = [],
        i = 1;
      this.endpoints
        .filter((ep) => ep.type == "in")
        .forEach((ep) => {
          resEndpoints.push({
            id: ep[`@id`],
            name: ep[`@name`],
            type: ep[`type`],
            published: ep[`@published`],
            required: ep[`required`],
            left: -10,
            top: i++ * diff,
            transform: "rotate(90)",
          });
        });
      this.endpoints
        .filter((ep) => ep.type == "out")
        .forEach((ep) => {
          resEndpoints.push({
            id: ep[`@id`],
            name: ep[`@name`],
            type: ep[`type`],
            published: ep[`@published`],
            required: ep[`required`],
            left: -10,
            top: i++ * diff,
            transform: "rotate(-90)",
          });
        });
      return resEndpoints;
    },

    /**
     * Triggered when changes on the container endpoints are detected.
     */
    onModelChange(path) {
      this.$util.log(`[CompositeContainer] onModelChange(${path})`);

      // refresh endpoints
      // - remove everything
      this.endpoints.splice(0, this.endpoints.length);

      // - add everything
      _.each(this.component.endpoints, (ep, epId) => {
        this.endpoints.push(ep);
      });

      this.$forceUpdate();
    },

    load() {
      this.$util.log(`[CompositeContainer] load()`);
      if (this.loaded) this.unload();

      // - register watch (only on endpoints)
      this.destroyers = [];
      this.destroyers.push({
        id: this.component[`@id`],
        fn: this.$watch(
          () => this.component.endpoints,
          (newVal, oldVal) => {
            this.onModelChange(this.component[`@id`], newVal, oldVal);
          },
          { deep: true }
        ),
      });

      // - force endpoints refreshing
      this.onModelChange();

      this.loaded = true;
    },
    unload() {
      this.$util.log(`[CompositeContainer] unload()`);
      if (!this.loaded) return;

      if (this.destroyers && this.destroyers.length) {
        this.destroyers.forEach((destroyer) => destroyer.fn());
      }

      this.loaded = false;
    },

    /*onAction(ev) {
      this.$util.log(`[CompositeContainer] onAction(${JSON.stringify(ev)})`);
      if (ev.type == "select" && ev.path == null) {
        this.selected = true;
      } else {
        this.selected = false;
      }
      this.$emit("action", ev);
    },*/
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.composite-container {
  position: relative;
  display: flex;
  height: 100%;
  border: 2px solid lightgray;
  overflow: visible;
}
.composite-container-selected {
  border: 2px solid gray;
}
.composite-container-header {
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  display: flex;
  flex-direction: row;
  height: 40px;
  align-items: center;
  font-size: 1.5em;
  color: white;
  /*background: linear-gradient(to right, gray, lightgray);*/
  padding: 0px 20px;
  z-index: 2;
}
.composite-container-body {
  padding-top: 40px; /* the size of the header */
  height: 100%;
  width: 100%;
  /*flex-grow: 1;
  display: flex;
  /*flex-direction: row;*/
}
/*.composite-container-content {
  flex-grow: 1;
}*/
.composite-container-selector {
  position: absolute;
  width: 10px;
  height: 10px;
  background-color: black;
  z-index: 100;
}

.top-left {
  top: -5px;
  left: -5px;
}
.top-right {
  top: -5px;
  right: -5px;
}
.bottom-left {
  bottom: -5px;
  left: -5px;
}
.bottom-right {
  bottom: -5px;
  right: -5px;
}
.endpoints {
  position: absolute;
  top: 0px;
  left: -10px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  z-index: 3;
}
.endpoint {
  position: relative;
}
.endpoint > label {
  position: absolute;
  top: -20px;
  left: -20px;
}
</style>
