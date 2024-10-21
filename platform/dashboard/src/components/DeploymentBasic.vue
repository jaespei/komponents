<template>
  <v-row>
    <v-col cols="4" align="center" justify="center" align-self="center">
      <v-row>
        <v-col cols="12">
          <v-chip :color="deployment.state == 'ready' ? 'green' : 'red'" dark>
            {{ deployment.state }}
          </v-chip>
        </v-col>
        <v-col cols="12">
          <v-avatar size="100" tile>
            <v-icon v-if="!component.pict" color="grey" size="64"
              >mdi-cube</v-icon
            >
            <img v-else :src="component.pict" />
          </v-avatar>
        </v-col>
      </v-row>
    </v-col>
    <v-col cols="8">
      <v-row>
        <v-col cols="12">
          <v-text-field
            label="Title"
            dense
            outlined
            readonly
            :value="deployment.title"
            @input="changeDeployment('title', $event)"
          ></v-text-field>
        </v-col>
        <v-col cols="12">
          <v-list flat>
            <v-subheader>COMPONENT</v-subheader>
            <v-list-item link :to="`/components/${component.id}`">
              <v-list-item-icon>
                <v-icon>mdi-open-in-new</v-icon>
              </v-list-item-icon>
              <v-list-item-content>{{ component.title }}</v-list-item-content>
            </v-list-item>
          </v-list>
          <!--v-text-field to="/pepe"
            label="Component title"
            dense
            outlined
            readonly
            :value="component.title"
          ></v-text-field-->
        </v-col>

        <!--v-col cols="12">
          <v-list>
            <v-list-item v-for="ep in entrypoints" :key="ep.name">
              {{ ep.name }}
            </v-list-item>
          </v-list>
        </v-col-->
      </v-row>
    </v-col>
  </v-row>
</template>
<script>
import _ from "lodash";
export default {
  name: "DeploymentBasic",
  props: {
    deployment: {
      type: Object,
      required: true,
    },
    mode: {
      type: String,
    },
  },
  data() {
    return {
      component: {
        id: "",
        title: "",
        pict: "",
        summary: "",
      },
    };
  },
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      let type = "read";
      if (!this.deployment.labels) return type;
      for (let label of this.deployment.labels) {
        if (label.startsWith("perm=")) {
          let [name, perm] = label.split("=");
          let [role, right] = perm.split(":");
          if (this.$root.user.roles.includes(role)) {
            if (right == "o") {
              type = "owner";
              break;
            } else if (right == "w" && type != "owner") type = "write";
          }
        }
      }
      return type;
    },
  },
  /*created() {
    this.log("created");
    window.card = this;
    this.refresh();
  },*/
  updated() {
    this.log("updated");
    this.refresh();
  },
  methods: {
    log(msg) {
      //this.$util.log(`[DeploymentBasic] ${msg}`);
    },
    async refresh() {
      this.log(`refresh(${JSON.stringify(this.deployment)})`);

      // Obtain component
      let label = _.find(this.deployment.labels, (label) =>
        label.startsWith("component=")
      );
      if (label) {
        let [name, componentId] = label.split("=");
        try {
          let [component] = await this.$model.listComponents(
            this.$root.user.token,
            { id: componentId }
          );
          for (let key in component)
            this.$set(this.component, key, component[key]);
        } catch (err) {
          this.$root.error(err, "Unable to obtain component data", 5000);
        }
      }
    },
    
    changeDeployment(prop, value) {
      this.$util.log(`changeDeployment(${prop},${value})`);
      let event = {};
      event[prop] = value;
      this.$emit("change", event);
    },
  },
};
</script>
<style scoped>
</style>