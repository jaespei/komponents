<template>
    <v-card>
      <v-img
        class="white--text align-end"
        height="200px"
        src="https://cdn.vuetifyjs.com/images/cards/docks.jpg"
      >
        <v-btn elevation="2" fab>
          <v-icon>mdi-magnify</v-icon>
        </v-btn>
      </v-img>
      <v-card-title>{{ component.title }} ({{ component.name }})</v-card-title>
      <v-card-text class="text--primary">{{ component.desc }}</v-card-text>
      <v-divider></v-divider>
      <v-card-subtitle>VARIABLES</v-card-subtitle>
      <v-card-text class="text--primary">{{ component.desc }}</v-card-text>
      <v-divider></v-divider>
      <v-card-subtitle>VOLUMES</v-card-subtitle>
      <v-card-text class="text--primary">{{ component.desc }}</v-card-text>
      <v-card-actions>
        <v-btn color="blue" text> Share </v-btn>
        <v-btn color="blue" text> Explore </v-btn>
      </v-card-actions>
    </v-card>
</template>

<script>
export default {
  name: "ComponentDetails",
  props: {
    component: {
      type: Object
    },
    mode: {
      type: String
    }
  },
  data() {
    return {};
  },
  created() {
    //this.refresh();
  },
  methods: {},
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.v-btn--fab {
  margin: 10px;
  float: right;
}
</style>
