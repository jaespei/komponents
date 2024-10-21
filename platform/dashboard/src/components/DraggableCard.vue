<template>
  <v-card>
    <!--v-toolbar flat>
      <v-btn icon @click="resize"><v-icon>{{ maximized && "mdi-menu-up" || "mdi-menu-down" }}</v-icon></v-btn>
      <v-toolbar-title>{{ title }}</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn icon @click="close"><v-icon>mdi-close</v-icon></v-btn>
    </v-toolbar-->
    <v-card-title>
        <v-btn icon @click="resize"><v-icon>{{ maximized && "mdi-menu-up" || "mdi-menu-down" }}</v-icon></v-btn>
        <span class="text-h6">{{ title }}</span>
        <v-spacer></v-spacer>
        <v-btn icon @click="close"><v-icon>mdi-close</v-icon></v-btn>
    </v-card-title>
    <v-expand-transition>
        <v-card-text v-show="maximized">
            <slot></slot>
        </v-card-text>
    </v-expand-transition>
  </v-card>
</template>
<script>
export default {
  name: "DraggableCard",
  props: {
    title: {
      type: String,
      required: true,
    },
    state: {
        type: String
    }
  },
  data() {
    return {
        maximized: this.state == "maximized"
    };
  },
  methods: {
      resize() {
          this.maximized = !this.maximized;
          this.$emit(this.maximized && "maximize" || "minimize");
      },
      close() {
          this.$emit("close");
      }
  }
};
</script>
<style scoped>
</style>