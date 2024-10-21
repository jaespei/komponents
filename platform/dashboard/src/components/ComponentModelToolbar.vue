<template>
  <v-sheet color="white" elevation="2" style="margin-right: 1px">
    <div
      v-for="action in actions"
      :key="action.id"
      style="display: flex; flex-direction: row"
    >
      <v-tooltip left>
        <template v-slot:activator="{ on, attrs }">
          <v-btn
            v-bind="attrs"
            v-on="on"
            active-class="selected"
            depressed
            icon
            @click="click(action.actions ? /*findAction(action, action.action)*/ `${action.id}/${action.action}`: action.id)"
            :class="isSelected(action) ? 'selected' : ''"
          >
            <v-icon>{{
              action.actions
                ? findAction(action, action.action).icon
                : action.icon
            }}</v-icon>
          </v-btn>
        </template>
        <span>{{ action.actions? findAction(action, action.action).title: action.title }}</span>
      </v-tooltip>

          <v-icon
            v-if="action.actions"
            :id="'more_' + action.id"
            style="cursor: pointer; width: 12px"
            >mdi-menu-right</v-icon
          >
          <div v-else style="width: 12px"></div>
          <v-menu
            v-if="action.actions"
            :activator="'#more_' + action.id"
            offset-x
          >
            <v-sheet style="flex-direction: row">
              <v-tooltip bottom v-for="subaction in action.actions"
                    :key="subaction.id">
                <template v-slot:activator="{ on, attrs }">
                  <v-btn
                    v-bind="attrs"
                    v-on="on"                    
                    icon
                    @click="click(`${action.id}/${subaction.id}`)"
                  >
                    <v-icon>{{ subaction.icon }}</v-icon>
                  </v-btn>
                </template>
                <span>{{ subaction.title }}</span>
                </v-tooltip
              ></v-sheet
            >
            </v-menu>
        
        
    </div></v-sheet
  >
</template>
  

<script>
import SvgIcon from "./SvgIcon";
export default {
  name: "ComponentModelToolbar",
  components: {
    //SvgIcon
  },
  props: {
    actions: {
      type: Array,
      required: true,
    },
    selectedAction: {
      type: Object,
    },
  },
  data() {
    return {};
  },
  computed: {},
  created() {},
  methods: {
    /**
     * Find subaction in list of actions.
     */
    findAction(action, id) {
      return action.actions.find(subaction => subaction.id == id);
    },
    /**
     * Determines whether the specified action is selected.
     */
    isSelected(action) {
      if (action.actions) {
        // If subactions available check selected one
        return this.selectedAction.id == action.action;
      } else {
        return this.selectedAction.id == action.id;
      }
    },
    click(id) {
      this.$util.log(`[ComponentModelToolbar] click(${id})`);
      this.$emit("action", id);
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.v-sheet {
  display: flex;
  flex-direction: column;
  padding: 10px;
  margin: 0px 1px;
}
.v-sheet > div > .v-btn {
  margin: 5px 0px;
}
.selected {
  /*background-color: #e57373;*/
  /*opacity: 0.12;*/
  background-color: #d3d3d3 !important;
}
</style>
