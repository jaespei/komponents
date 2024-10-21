<template>
  <div
    :class="{
      'composite-container': true,
      'composite-container-selected': selected,
    }"
  >
    <div v-if="selected" class="composite-container-selector top-left"></div>
    <div v-if="selected" class="composite-container-selector top-right"></div>
    <div v-if="selected" class="composite-container-selector bottom-left"></div>
    <div
      v-if="selected"
      class="composite-container-selector bottom-right"
    ></div>
    <div ref="header" class="composite-container-header">
      {{ components[componentPath][`@name`] }}
    </div>
    <div ref="body" class="composite-container-body">
      <composite-internals
        :components="components"
        :componentsLayout="componentsLayout"
        :componentsDisplay="componentsDisplay"
        :componentPath="componentPath"
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
    componentPath: { type: String },
    action: { type: Object },
    mode: { type: String },
  },
  data() {
    return {};
  },
  computed: {
    selected() {
      return (this.action && this.action.name == "pointer" && this.action.subcomponentId == "");
    },
  },
  watch: {
  },
  created() {
    console.log(`[CompositeContainer] created()`);
    window.container = this;
  },
  mounted() {
    /*this.clay = new Clay(this.$refs.container);
    this.clay.on("resize", (ev) => {
      console.log(`[CompositeContainer] resize(${JSON.stringify(ev)})`);
      this.contentHeight = this.$refs.container.offsetHeight - /* padding * 5 - this.$refs.toolbar.$el.offsetHeight;
      console.log(`[ComponentModel] container=${this.$refs.container.offsetHeight}, toolbar=${this.$refs.toolbar.$el.offsetHeight}, contentHeight=${this.contentHeight}`);
      this.$refs.content.$el.style.height = this.contentHeight + "px";
      this.$refs.content.$el.style.maxHeight = this.contentHeight + "px";
    });*/
  },
  beforeDestroy() {
    console.log(`[CompositeContainer] beforeDestroy()`);
  },
  methods: {
    /*onAction(ev) {
      console.log(`[CompositeContainer] onAction(${JSON.stringify(ev)})`);
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
  flex-grow: 1;
  position: relative;
  /*display: flex;
  flex-direction: column;*/
  margin: 40px;
  padding: 0px;
  border: 2px solid gray;
  overflow: hidden;
  /*overflow: visible;*/
}
.composite-container-selected {
  border: 2px solid blue;
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
  background: linear-gradient(to right, gray, lightgray);
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
  background-color: blue;
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
</style>
