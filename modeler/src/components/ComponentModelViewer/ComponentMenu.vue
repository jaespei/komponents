<template>
  <div class="menu" :style="{ top: `${top}px`, left: `${left}px` }">
    <v-tooltip top v-for="action in actions" :key="action.name">
      <template v-slot:activator="{ on, attrs }">
        <v-btn
          v-bind="attrs"
          v-on="on"
          elevation="0"
          icon
          @click="clicked(action.name)"
          ><v-icon>{{ action.icon }}</v-icon></v-btn
        >
      </template>
      <span>{{ action.title }}</span>
    </v-tooltip>

    <!--v-btn
      v-for="action in actions"
      :key="action.name"      
      elevation="0"
      icon
      @click="clicked(action.name)"
      ><v-icon>{{ action.icon }}</v-icon></v-btn
    -->
  </div>
</template>
<script>
export default {
  name: "CompositeInternals",
  props: {
    actions: {
      type: Array,
    },
    top: {
      type: Number,
    },
    left: {
      type: Number,
    },
  },
  data() {
    return {
      /* actions: [
              {name: "pepe", title: "pepe", icon: "mdi-home"}
          ]*/
    };
  },
  methods: {
    clicked(name) {
      this.$util.log(`[ComponentMenu] clicked(${name})`);
      let action = this.actions.find(a => a.name == name);
      if (action) this.$emit("action", {type: name, data: action.data});
    },
  },
};
</script>
<style scoped>
.menu {
  position: absolute;
  display: flex;
  z-index: 20;
}
</style>