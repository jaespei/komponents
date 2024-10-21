<template>
  <v-row>
    <!--v-col cols="12">
      <v-chip-group v-if="tags.length" mandatory active-class="primary--text">
        <v-chip
          v-for="tag in tags"
          :key="tag.id"
          :color="tag.color"
          close
          @click:close="removeTag(tag)"
        >
          {{ tag.text }}
        </v-chip>
      </v-chip-group>
      <v-subheader v-else>No tags</v-subheader>
    </v-col-->
    <v-col cols="12">
      <v-form ref="addLabelForm" v-model="valid">
        <v-row>
          <v-col cols="4" align-self="center">
            <v-text-field
              label="Name"
              dense
              outlined
              :readonly="mode == 'read'"
              v-model="label.name"
              :rules="[rules.required]"
            ></v-text-field>
          </v-col>
          <v-col cols="4" align-self="center">
            <v-text-field
              label="Value"
              dense
              outlined
              :readonly="mode == 'read'"
              v-model="label.value"
            ></v-text-field>
          </v-col>
          <v-col cols="4">
            <!--v-btn plain color="primary" @click="addLabel">Add label</v-btn-->
            <input
              id="file"
              @change="saveFile"
              type="file"
              :accept="label.type"
              style="display: none"
            />
            <v-overflow-btn
              class="my-2"
              :disabled="!valid"
              :items="commands"
              outlined
              flat
              segmented
              v-model="label.mode"
              item-value="value"
              item-text="text"
            ></v-overflow-btn>
          </v-col>
        </v-row>
      </v-form>
    </v-col>
    <v-col cols="12">
      <v-data-table
        disable-pagination
        hide-default-footer
        :headers="headers"
        :items="labels"
        :search="search"
        dense
      >
        <template v-slot:top>
          <v-toolbar flat>
            <v-text-field
              v-model="search"
              append-icon="mdi-magnify"
              label="Filter"
              clearable
              class="mx-4"
            ></v-text-field>
            <v-spacer></v-spacer>
          </v-toolbar>
        </template>
        <template v-slot:item.actions="{ item }">
          <v-btn icon>
            <v-icon @click.stop="removeLabel(item)">mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-col>
  </v-row>
</template>
<script>
import _ from "lodash";

export default {
  name: "ComponentLabels",
  props: {
    component: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      valid: false,
      label: {
        name: "",
        value: "",
        mode: "label",
        type: "",
      },
      headers: [
        {
          text: "NAME",
          align: "left",
          sortable: true,
          value: "name",
          width: "200px",
        },
        {
          text: "VALUE",
          align: "left",
          sortable: true,
          value: "value",
          width: "200px",
        },
        {
          text: "ACTIONS",
          align: "center",
          sortable: false,
          value: "actions",
        },
      ],
      rules: {
        required: (value) => !!value || "Required",
      },
      commands: [
        {
          text: "Add Label",
          value: "label",
          callback: () => {
            this.label.type = "";
            this.$nextTick(() => this.addLabel());
          },
        },
        {
          text: "Attach file",
          value: "file",
          callback: () => {
            this.label.type = "";
            this.$nextTick(() => this.openFile());
          },
        },
        {
          text: "Attach picture",
          value: "picture",
          callback: () => {
            this.label.type = "image/*";
            this.$nextTick(() => this.openFile());
          },
        },
      ],
      search: "",
    };
  },
  computed: {
    mode() {
      let perms = _.filter(this.component.perms, (perm) =>
        this.$root.user.roles.includes(perm.role)
      );
      if (_.find(perms, (perm) => perm.type == "write" || perm.type == "owner"))
        return "write";
      else return "read";
    },
    labels() {
      return _.map(this.component.labels, (label, i) => {
        let [name, value] = label.split("=");
        return { id: i, name: name, value: value };
      });
    },
  },
  created() {
    window.card = this;
  },
  methods: {
    log(msg) {
      this.$util.log(`[ComponentLabels] log(${msg})`);
    },
    clearLabel() {
      this.log(`clearLabel(${JSON.stringify(this.label)}`);
      /*this.label.name = "";
        this.label.value = "";*/
      let mode = this.label.mode;
      let type = this.label.type;
      this.$refs.addLabelForm.reset();
      this.$nextTick(() => {
        this.label.mode = mode;
        this.label.type = type;
      });
    },
    addLabel() {
      this.log(`addLabel()`);
      let labels = this.component.labels.concat(
        `${this.label.name}=${this.label.value}`
      );
      this.clearLabel();
      this.$emit("change", { labels: labels });
    },
    openFile() {
      this.log(`openFile()`);
      document.getElementById("file").click();
    },
    saveFile() {
      var element = document.getElementById("file");
      var file = element.files[0];
      var reader = new FileReader();
      reader.onloadend = () => {
        this.$set(this.label, "value", reader.result);
        this.addLabel();
      };
      if (this.label.type == "image/*") reader.readAsDataURL(file);
      else reader.readAsText(file);
    },
    removeLabel(label) {
      this.log(`removeLabel(${label.id})`);
      let labels = _.filter(this.component.labels, (lbl, i) => i != label.id);
      this.log(`labels=${labels}`);
      this.$emit("change", { labels: labels });
    },
  },
};
</script>
<style scoped>
</style>