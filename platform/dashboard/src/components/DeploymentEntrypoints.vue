<template>
  <v-row>
    <v-col cols="12">
      <v-expansion-panels flat>
        <v-expansion-panel v-for="ep in entrypoints" :key="ep.name">
          <v-expansion-panel-header> {{ ep.name }} </v-expansion-panel-header>
          <v-expansion-panel-content>
            <v-data-table
              :headers="headers"
              :items="domains"
              :items-per-page="5"
              :search="filterText"
              @click:row="openLink(ep, $event)"
            >
              <template v-slot:item.link="{ item }">
                <a href="#">
                  {{ ep.protocol }}://{{ item.ingress }}{{ ep.path }}
                </a>
              </template>
            </v-data-table>
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-col>
  </v-row>
</template>
<script>
import _ from "lodash";
export default {
  name: "DeploymentEntrypoints",
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
      loaded: false,
      domains: [],
      headers: [
        {
          text: "DOMAIN",
          align: "center",
          sortable: true,
          value: "title",
        },
        {
          text: "LINK",
          align: "center",
          sortable: true,
          value: "link",
        },
      ],
      filterText: "",
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
    entrypoints() {
      if (!this.deployment || !this.deployment.id) return [];
      return _.map(this.deployment.model.entrypoints, (ep, epName) => {
        return {
          name: epName,
          protocol: ep.protocol,
          path: ep.path,
        };
      });
    },
  },
  created() {
    this.log("mounted");
    window.card = this;
    this.refresh();
  },
  updated() {
    this.log("updated");
    this.refresh();
  },
  methods: {
    log(msg) {
      this.$util.log(`[DeploymentEntrypoints] ${msg}`);
    },
    async refresh() {
      this.log(`refresh(${JSON.stringify(this.deployment)})`);

      if (!this.deployment.id) return;
      if (this.loaded) return;

      // Obtain domains
      let query = {};
      _.each(this.deployment.model.domains, (domId) => {
        query.id = query.id
          ? { $in: _.concat(query.id.$in, domId) }
          : { $in: [domId] };
      });
      try {
        let domains = await this.$model.listDomains(
          this.$root.user.token,
          query
        );
        Array.prototype.push.apply(this.domains, domains);

        /*_.each(domains, (domain) => {
          this.$set(this.domains, domain.id, domain);
        });*/
      } catch (err) {
        this.$root.error(err, "Unable to obtain domain data", 5000);
      } finally {
        this.loaded = true;
      }
    },
    openLink(ep, domain) {
      this.log(`openLink(${ep.name},${domain.title})`);
      window.open(`${ep.protocol}://${domain.ingress}${ep.path}`);
    },
  },
};
</script>
<style scoped>
</style>