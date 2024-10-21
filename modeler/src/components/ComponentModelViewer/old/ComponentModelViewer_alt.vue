<template>
  <composite-internals
    v-if="path == ''"
    :components="components"
    :layout="layout"
    :display="display"
    :path="path"
    :mode="mode"
    :action="action"
    @action="$emit('action', $event)"
    @change="$emit('change', $event)"
  >
  </composite-internals>

  <composite-container v-else>
    <composite-internals
      :components="components"
      :layout="layout"
      :display="display"
      :path="path"
      :mode="mode"
      :action="action"
      @action="$emit('action', $event)"
      @change="$emit('change', $event)"
    >
    </composite-internals>
  </composite-container>

  <!--composite-container
    v-else
    :components="components"
    :layout="layout"
    :display="display"
    :path="path"
    :mode="mode"
    :action="action"
    @action="$emit('action', $event)"
    @change="$emit('change', $event)"
  >
    >
  </composite-container-->
</template>

<script>
import CompositeInternals from "./CompositeInternals.vue";
import CompositeContainer from "./CompositeContainer.vue";

export default {
  components: { CompositeInternals, CompositeContainer },
  name: "CompositeModelViewer",
  props: {
    components: { type: Object, required: true },
    layout: { type: Object },
    display: { type: Object },
    path: { type: String, default: "" },
    action: { type: String, default: "select" },
    mode: { type: String, default: "write" },
  },
  data() {
    return {};
  },
  created() {
    console.log(`[CompositeModelViewer] created()`);
    window.viewer = this;
  },
  beforeDestroy() {
    console.log(`[CompositeModelViewer] beforeDestroy()`);
  },
  methods: {},
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
