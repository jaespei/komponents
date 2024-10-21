<template>
  <v-row>
    <v-col cols="12">
      <v-chip-group v-if="tags.length" mandatory>
        <v-chip
          v-for="tag in tags"
          :key="tag.id"
          :color="tag.color"
          text-color="black"
          close
          @click:close="removeTag(tag)"
        >
          {{ tag.text }}
        </v-chip>
      </v-chip-group>
      <v-subheader v-else>No tags</v-subheader>
    </v-col>
    <v-col cols="12">
      <v-row>
        <v-col cols="5">
          <v-text-field
            label="Tag"
            dense
            outlined
            :readonly="mode == 'read'"
            v-model="tag.text"
          ></v-text-field>
        </v-col>
        <v-col cols="2" align="center">
          <v-menu offset-y :close-on-click="true">
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                class="mx-2"
                fab
                dark
                width="24"
                height="24"
                v-bind="attrs"
                v-on="on"
                :color="tag.color"
              ></v-btn>
            </template>
            <v-color-picker dot-size="25" v-model="tag.color"></v-color-picker>
          </v-menu>
        </v-col>
        <v-col cols="5">
          <v-btn plain color="primary" @click="addTag">Add tag</v-btn>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>
<script>
import _ from "lodash";

export default {
  name: "ComponentTags",
  props: {
    component: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      //tags: [],
      tag: {
        text: "",
        color: "blue",
      },
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
    tags() {
      let tags = [];
      _.each(this.component.labels, (label, i) => {
        if (label.startsWith("tag=")) {
          let [name, tag] = label.split("=");
          let [text, color] = tag.split(":");
          tags.push({
            id: i,
            text: text,
            color: color,
          });
        }
      });
      return tags;
    },
  },
  methods: {
    addTag() {
      this.$util.log(`[ComponentTags] addTag()`);
      let labels = this.component.labels.concat(
        `tag=${this.tag.text}:${this.tag.color}`
      );
      this.tag.text = "";
      this.$emit("change", { labels: labels });
    },
    removeTag(tag) {
      this.$util.log(`[ComponentTags] removeTag(${tag.id})`);
      let labels = _.filter(this.component.labels, (label, i) => i != tag.id);
      this.$emit("change", { labels: labels });
    },
  },
};
</script>
<style scoped>
</style>