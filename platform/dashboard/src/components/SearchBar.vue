<template>
  <v-toolbar :extension-height="filtersHeight" color="elevation-0"> 
    <v-text-field
      light
      v-model="filterText"
      placeholder="Search"
      solo
      clearable
      hide-details
      single-line
      @change="appendFilter(filterText)"
    ></v-text-field>
    <template v-slot:extension>
      <v-row ref="filtersContainer">
        <v-chip-group column multiple mandatory v-model="currentSelectedFixedFilters">
          <v-chip
            filter
            v-for="f in fixedFilters"
            :key="f.label"
            :value="f.value"
          >
            {{ f.label }}
          </v-chip>
        </v-chip-group>
        <v-chip-group column multiple v-model="currentSelectedFilters">
          <v-chip
            filter
            close
            v-for="f in currentFilters"
            :key="f.label"
            :value="f.value"
            @click:close="removeFilter(f)"
          >
            {{ f.label }}
          </v-chip>
        </v-chip-group>
      </v-row>
    </template>
  </v-toolbar>
</template>
<script>
export default {
  name: "SearchBar",
  props: {
    filters: {
        type: Array,
        default: () => []
    },
    fixedFilters: {
      type: Array,
      default: () => []
    },
    selectedFilters: {
        type: Array,
        default: () => []
    },
    selectedFixedFilters: {
        type: Array,
        default: () => []
    }
  },
  data() {
    return {
      currentFilters: [],
      currentSelectedFilters: [],
      currentSelectedFixedFilters: [],
      filterText: "",
      filtersHeight: 0,
    };
  },
  watch: {
      currentSelectedFixedFilters() {
          this.$emit("change", this.currentSelectedFixedFilters.concat(this.currentSelectedFilters));
      },
      currentSelectedFilters() {
          this.$emit("change", this.currentSelectedFixedFilters.concat(this.currentSelectedFilters));
      }
  },
  created() {
      window.addEventListener("resize", this.computeFiltersHeight);
      // make copies, in order to evolve independently from parent
      this.currentFilters = this.filters.slice(0);
      this.currentSelectedFilters = this.selectedFilters.slice(0);
      this.currentSelectedFixedFilters = this.selectedFixedFilters.slice(0);
      this.computeFiltersHeight();
  },
  destroyed() {
      window.removeEventListener("resize", this.computeFiltersHeight);
  },
  methods: {
    appendFilter(text) {
      this.$util.log(`[SearchBar] appendFilter(${text})`);
      if (text) {
        let filter = null;
        if (text.indexOf("=") != -1) {
          filter = { label: text, value: text };
        } else {
          filter = { label: text, value: `title=${text}` };
        }

        // check whether the filter was added before
        if (!this.currentFilters.find((f) => f.value == filter.value)) {
          // by default the new filter is selected
          this.currentFilters.push(filter);
          this.currentSelectedFilters.push(filter.value);
          this.computeFiltersHeight();
        }
        this.filterText = "";
      }
    },
    removeFilter(filter) {
      this.$util.log(`[SearchBar] removeFilter(${filter.value})`);
      let index = this.currentFilters.findIndex((f) => f.value == filter.value);
      this.currentFilters.splice(index, 1);
      index = this.currentSelectedFilters.findIndex((f) => f.value == filter.value);
      if (index !== -1) this.currentSelectedFilters.splice(index, 1);
      this.computeFiltersHeight();
    },
    computeFiltersHeight() {
      this.$nextTick(() => {
        this.filtersHeight = this.$refs.filtersContainer.offsetHeight;
      });
    },
  },
};
</script>
<style scoped>
</style>