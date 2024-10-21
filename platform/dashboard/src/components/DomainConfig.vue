<template>
  <v-row>
    <v-col cols="12">
      <v-data-table
        disable-pagination
        hide-default-footer
        :headers="cfgHeaders"
        :items="cfgItems"
        :search="cfgSearch"
        dense
      >
        <template v-slot:top>
          <v-toolbar flat>
            <v-text-field
              v-model="cfgSearch"
              append-icon="mdi-magnify"
              label="Filter"
              clearable
              class="mx-4"
            ></v-text-field>
            <v-spacer></v-spacer>
          </v-toolbar>
        </template>
      </v-data-table>
    </v-col>
  </v-row>
</template>
<script>
import _ from "lodash"
export default {
  name: "DomainConfig",
  props: {
    domain: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      cfgHeaders: [
        {
          text: "KEY",
          align: "left",
          sortable: true,
          value: "key",
          width: "200px",
        },
        {
          text: "VALUE",
          align: "left",
          sortable: true,
          value: "value",
          width: "200px",
        },
      ],
      cfgSearch: "",
    };
  },
  computed: {
    cfgItems() {
      return _.map(this.domain.cfg, (value, key) => {
        return { key: key, value: value };
      });
    },
  },
  methods: {},
};
</script>
<style scoped>
</style>