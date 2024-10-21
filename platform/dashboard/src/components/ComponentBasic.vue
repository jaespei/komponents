<template>
  <v-row>
    <v-col cols="4" align="center" justify="center" align-self="center">
      <v-row>
        <v-col
          cols="12
        "
        >
          <input
            id="filePicture"
            @change="savePicture"
            type="file"
            accept="image/*"
            style="display: none"
          />
          <v-avatar size="100" tile>
            <v-icon v-if="!component.pict" color="grey" size="64"
              >mdi-cube-outline</v-icon
            >
            <img v-if="component.pict" :src="component.pict" />
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
          <v-text-field
            label="Title"
            dense
            outlined
            :readonly="myMode == 'read'"
            :value="component.title"
            @input="changeComponent('title', $event)"
          ></v-text-field>
        </v-col>
        <v-col cols="12">
          <v-textarea
            label="Summary"
            dense
            outlined
            :readonly="myMode == 'read'"
            :value="component.summary"
            @input="changeComponent('summary', $event)"
          ></v-textarea>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>
<script>
import _ from "lodash";

export default {
  name: "ComponentBasic",
  props: {
    component: {
      type: Object,
      required: true,
    },
    mode: {
      type: String
    }
  },
  data() {
    return {
    };
  },
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      let perms = _.filter(this.component.perms, (perm) =>
        this.$root.user.roles.includes(perm.role)
      );
      if (_.find(perms, (perm) => perm.type == "write" || perm.type == "owner"))
        return "write";
      else return "read";
    },
  },
  /*updated() {
    this.$util.log(
      `[ComponentBasic] updated(${JSON.stringify(this.component)})`
    );
    if (!this.updated.id) {
      for (let key in this.component)
        this.$set(this.updated, key, this.component[key]);
    }
  },*/
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
        this.changeComponent("pict", reader.result);
        /*this.$set(this.updated, "pict", reader.result);
        this.$emit("change", { pict: this.updated.pict });*/
      };
      reader.readAsDataURL(file);
      //reader.readAsText(file);
    },
    changeComponent(prop, value) {
      this.$util.log(`changeComponent(${prop},${value})`);
      let event = {};
      event[prop] = value;
      this.$emit("change", event);
    },
  },
};
</script>
<style scoped>
</style>