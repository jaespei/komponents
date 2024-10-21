<template>
  <div class="component-viewer">
    <composite-internals
      v-if="componentRoute.length == 0"
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

    <composite-container
      v-else
      :components="components"
      :componentsLayout="componentsLayout"
      :componentsDisplay="componentsDisplay"
      :componentRoute="componentRoute"
      :mode="mode"
      :action="action"
      @action="$emit('action', $event)"
      @change="$emit('change', $event)"
    >
    </composite-container>
  </div>
  
</template>

<script>
import CompositeInternals from "./CompositeInternals.vue";
import CompositeContainer from "./CompositeContainer.vue";

export default {
  components: { CompositeInternals, CompositeContainer },
  name: "CompositeModelViewer",
  props: {
    components: { type: Object },
    componentsLayout: { type: Object },
    componentsDisplay: { type: Object },
    componentRoute: { type: String },
    action: { type: Object },
    mode: { type: String },
  },
  data() {
    return {};
  },
  created() {
    this.$util.log(`[CompositeModelViewer] created()`);
    window.viewer = this;
  },
  beforeDestroy() {
    this.$util.log(`[CompositeModelViewer] beforeDestroy()`);
  },
  methods: {},
};
</script>
<style scoped>
.component-viewer {
  position:relative; 
  flex-grow: 1; 
  overflow: hidden; 
  padding: 40px;
}
</style>
