<template>
  <v-row>
    <v-col cols="4" align="center" justify="center" align-self="center">
      <v-row>
        <v-col cols="12">
          <v-chip :color="domain.state == 'ready' ? 'green' : 'red'" dark>
            {{ domain.state }}
          </v-chip>
        </v-col>
        <v-col cols="12">
          <input
            id="filePicture"
            @change="savePicture"
            type="file"
            accept="image/*"
            style="display: none"
          />
          <v-avatar size="100" tile>
            <v-icon v-if="!domain.pict" color="grey" size="64"
              >mdi-server</v-icon
            >
            <img v-if="domain.pict" :src="domain.pict" />
          </v-avatar>
        </v-col>
        <v-col v-if="myMode == 'write'" cols="12">
          <v-btn plain @click="openPicture">Set picture</v-btn>
        </v-col>
      </v-row>
    </v-col>
    <v-col cols="8">
      <v-row>
        <v-col cols="12">
          <v-select
            :items="domainTypes"
            label="Type"
            dense
            outlined
            readonly
            v-model="domain.type"
          ></v-select>
        </v-col>
        <v-col cols="12">
          <v-text-field
            label="Title"
            dense
            outlined
            :readonly="myMode == 'read'"
            :value="domain.title"
            @input="changeDomain('title', $event)"
          ></v-text-field>
        </v-col>
        <v-col cols="12">
          <v-text-field
            label="Runtimes"
            dense
            outlined
            readonly
            v-model="domain.runtimes"
          ></v-text-field>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>
<script>
export default {
  name: "DomainBasic",
  props: {
    domain: {
      type: Object,
      required: true,
    },
    mode: {
      type: String,
    },
  },
  data() {
    return {
      domainTypes: [
        { text: "Kubernetes in Kind", value: "kind/k8s", disabled: false },
        { text: "External Kubernetes", value: "external/k8s", disabled: false },
        {
          text: "Google Kubernetes Engine - GKE",
          value: "gke",
          disabled: true,
        },
        {
          text: "Amazon Elastic Container Service for Kubernetes - EKS",
          value: "eks",
          disabled: true,
        },
        { text: "Swarm Cluster", value: "swarm", disabled: true },
        { text: "Docker Machine", value: "docker", disabled: true },
        {
          text: "Google Kubernetes Engine - GKE",
          value: "gke",
          disabled: true,
        },
      ],
    };
  },
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      let type = "read";
      if (!this.domain.labels) return type;
      for (let label of this.domain.labels) {
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
  methods: {
    openPicture() {
      this.$util.log(`openPicture()`);
      document.getElementById("filePicture").click();
    },
    savePicture() {
      var element = document.getElementById("filePicture");
      var file = element.files[0];
      var reader = new FileReader();
      reader.onloadend = () => {
        this.changeDomain("pict", reader.result);
      };
      reader.readAsDataURL(file);
      //reader.readAsText(file);
    },
    changeDomain(prop, value) {
      this.$util.log(`changeDomain(${prop},${value})`);
      let event = {};
      event[prop] = value;
      this.$emit("change", event);
    },
  },
};
</script>
<style scoped>
</style>