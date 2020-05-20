let EB = {};
EB.encounterBudged = {
  trivial: 40,
  low: 60,
  moderate: 80,
  severe: 120,
  extreme: 160
};
EB.characterAdjustment = {
  trivial: 10,
  low: 15,
  moderate: 20,
  severe: 30,
  extreme: 40
};
EB.creatureXPDiff = {
  "-4": 10,
  "-3": 15,
  "-2": 20,
  "-1": 30,
  "0": 40,
  "1": 60,
  "2": 80,
  "3": 120,
  "4": 160
};

EB.difficultyToTreatPC = "deadly";

EB.borderStyle = "2px solid rgb(120, 46, 34)";
EB.highlightStyle = "";

Handlebars.registerHelper("capitalizeAll", function(str) {
  return str.toUpperCase();
});

class EncounterBuilderApplication extends Application {
  constructor(Actors, options = {}) {
    super(options);

    if (!game.user.isGM) return;

    this.object = Actors;
    this.allies = [];
    this.opponents = [];
    this.allyRating = {
      trivial: 0,
      low: 0,
      moderate: 0,
      severe: 0,
      extreme: 0
    };
    this.alliesLevel = 0;
    this.totalXP = 0;
    this.perAllyXP = 0;
    this.combatDifficulty = "trivial";
    game.users.apps.push(this);
  }

  static get defaultOptions() {
    const options = super.defaultOptions;
    options.title = game.i18n.localize("EB.Title");
    options.id = game.i18n.localize("EB.id");
    options.template = "modules/encounter-builder/templates/builder-app.html";
    options.closeOnSubmit = true;
    options.popOut = true;
    options.width = 510;
    options.height = "auto";
    options.classes = ["encounter-builder", "builder-form"];
    return options;
  }

  async getData() {
    return {
      allies: this.allies,
      opponents: this.opponents,
      ratings: this.allyRating,
      allyxp: this.perAllyXP,
      allieslevel: this.alliesLevel,
      totalxp: this.totalXP,
      difficulty: this.combatDifficulty
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("#EBContainers .actor-container").each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart, false);
      li.addEventListener("click", this._onClickPortrait.bind(this));
    });
    html.find("#EBContainers .group-container").each((i, li) => {
      li.addEventListener("dragover", this._onDragOverHighlight);
      li.addEventListener("dragleave", this._onDragLeaveHighlight);
    });
    html
      .find("#EBContainers .ally-container")[0]
      .addEventListener("drop", this._onDropAlly.bind(this));
    html
      .find("#EBContainers .opponent-container")[0]
      .addEventListener("drop", this._onDropOpponent.bind(this));
    html.find("#EBXP .clear")[0].addEventListener("click", this._onClickButton);
    html[0].render = this.render;
    html[0].ondragover = this._onDragOver;
    html[0].ondrop = this._onDrop;
  }

  /**
   * Calculates XP thresholds for the PC characters, as well as the thresholds for monster/NPC combatants.
   *
   * @memberof EncounterBuilderApplication
   */
  calcXPThresholds() {
    let allyRating = {
      trivial: 0,
      low: 0,
      moderate: 0,
      severe: 0,
      extreme: 0
    };
    let totalXP = 0;
    let alliesLevel = 0;
    const app = game.users.apps.find(e => e.id === game.i18n.localize("EB.id"));

    this.allies.forEach(ally => {
      let level;
      if (ally.data.type === "character") {
        level = parseInt(ally.data.data.details.level.value);
        if (level === 0) {
          level = 1;
        }
      } else if (ally.data.type === "npc") {
        level = parseInt(ally.data.data.details.level.value);
        if (level < 0) {
          level = 19;
        }
      }
      alliesLevel += level;
      allyRating["trivial"] = EB.encounterBudged["trivial"];
      allyRating["low"] = EB.encounterBudged["low"];
      allyRating["moderate"] = EB.encounterBudged["moderate"];
      allyRating["severe"] = EB.encounterBudged["severe"];
      allyRating["extreme"] = EB.encounterBudged["extreme"];
    });

    alliesLevel = Math.round(alliesLevel / this.allies.length);

    const calcXPLevelDifference = function(diff) {
      let xp = 0;

      if (diff >= -4 && diff <= 4) {
        xp = EB.creatureXPDiff[diff.toString()];
      }

      return xp;
    };

    this.opponents.forEach(function(opponent, index) {
      let xp;
      if (opponent.data.type === "character") {
        let level = opponent.data.data.details.level.value;
        if (level === 0) {
          level = 1;
        }
        xp = calcXPLevelDifference(level - alliesLevel);
      } else if (opponent.data.type === "npc") {
        xp = calcXPLevelDifference(
          opponent.data.data.details.level.value - alliesLevel
        );
      }
      totalXP += xp;
    });

    const numAllies = this.allies.length;
    if (numAllies < 4) {
      if (numAllies > 0) {
        Object.keys(allyRating).forEach(key => {
          allyRating[key] =
            EB.encounterBudged[key] -
            EB.characterAdjustment[key] * (4 - numAllies);
        });
      }
    } else if (numAllies > 4) {
      Object.keys(allyRating).forEach(key => {
        allyRating[key] =
          EB.encounterBudged[key] +
          EB.characterAdjustment[key] * (numAllies - 4);
      });
    }

    this.allyRating = allyRating;
    this.totalXP = totalXP;
    this.alliesLevel = alliesLevel;

    let perAllyXP = Math.floor(this.totalXP / this.allies.length);

    if (isFinite(perAllyXP)) {
      this.perAllyXP = perAllyXP;
    } else {
      this.perAllyXP = 0;
    }
  }

  /**
   * Calculates the final difficulty rating of the combat (easy, medium, hard, deadly)
   *
   * @memberof EncounterBuilderApplication
   */
  calcRating() {
    let allyRating = this.allyRating;
    let totalXP = this.totalXP;
    let combatDifficulty = "trivial";

    Object.keys(allyRating).forEach(function(key) {
      let threshold = allyRating[key];
      if (totalXP >= threshold) {
        combatDifficulty = key;
      }
    });

    this.combatDifficulty = combatDifficulty;
  }

  /**
   * Ondrop template for ally and opponent fields. Attempts to return builder Application and Actor of interest.
   *
   * @param {*} event
   * @returns {Array}
   * @memberof EncounterBuilderApplication
   */
  async _onDropGeneral(event) {
    let data;
    data = JSON.parse(event.dataTransfer.getData("text/plain"));
    if (data.type !== game.actors.entity) {
      throw new Error(game.i18n.localize("EB.EntityError"));
    }

    const app = game.users.apps.find(e => e.id === game.i18n.localize("EB.id"));
    let actor;
    if (data.pack) {
      actor = await game.actors.importFromCollection(data.pack, data.id);
    } else {
      actor = game.actors.get(data.id);
    }
    return [app, actor];
  }

  /**
   * Ondrop for allies. Cannot have a playable character multiple times. Can have monsters/npcs multiple times.
   *
   * @param {*} event
   * @memberof EncounterBuilderApplication
   */
  async _onDropAlly(event) {
    event.preventDefault();

    let [app, actor] = await this._onDropGeneral(event);

    let actorExists;
    let actorExistsOpposing;
    if (actor.data.type === "character") {
      actorExists = app.allies.find(e => e.id === actor.id);
      actorExistsOpposing = app.opponents.find(e => e.id === actor.id);

      if (actorExistsOpposing) {
        let ix = this.opponents.findIndex(e => e.id === actor.id);
        this.opponents.splice(ix, 1);
      }
      if (!actorExists) {
        app.allies.push(actor);
      }
    } else if (actor.data.type === "npc") {
      app.allies.push(actor);
    }

    app.calcXPThresholds();
    app.calcRating();
    app.render();
  }

  /**
   * Ondrop for opponents. Cannot have a playable character multiple times. Can have monsters/npcs multiple times.
   *
   * @param {*} event
   * @memberof EncounterBuilderApplication
   */
  async _onDropOpponent(event) {
    event.preventDefault();

    let [app, actor] = await this._onDropGeneral(event);

    let actorExists;
    let actorExistsOpposing;
    if (actor.data.type === "character") {
      actorExists = app.opponents.find(e => e.id === actor.id);
      actorExistsOpposing = app.allies.find(e => e.id === actor.id);

      if (actorExistsOpposing) {
        let ix = this.allies.findIndex(e => e.id === actor.id);
        this.allies.splice(ix, 1);
      }
      if (!actorExists) {
        // FIXME For now, we won't allow too high or too low level for opponents
        let diff = actor.data.data.details.level.value - this.alliesLevel;
        if (diff >= -4 && diff <= 4) {
          app.opponents.push(actor);
        }
      }
    } else if (actor.data.type === "npc") {
      // FIXME For now, we won't allow too high or too low level for opponents
      let diff = actor.data.data.details.level.value - this.alliesLevel;
      if (diff >= -4 && diff <= 4) {
        app.opponents.push(actor);
      }
    }

    app.calcXPThresholds();
    app.calcRating();
    app.render();
  }

  _onDragOverHighlight(event) {
    const li = this;
    li.style["border"] = EB.borderStyle;
    li.style["background"] = EB.highlightStyle;
  }

  _onDragLeaveHighlight(event) {
    const li = this;
    li.style["border"] = "";
    li.style["background"] = "";
  }

  /**
   * Ondragstart for character portraits, sets data necessary to drag to canvas.
   *
   * @param {*} event
   * @memberof EncounterBuilderApplication
   */
  _onDragStart(event) {
    event.stopPropagation();
    const id = this.firstElementChild.id;
    const name = this.firstElementChild.title;

    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify({
        type: game.actors.entity,
        id: id,
        name: name
      })
    );
  }

  /**
   * Remove actor from calculation on clicking the portrait.
   *
   * @param {*} event
   * @memberof EncounterBuilderApplication
   */
  _onClickPortrait(event) {
    event.stopPropagation();

    const srcClass = event.srcElement.classList.value;
    const isPortrait = srcClass === "actor-portrait";
    const isHoverIcon =
      srcClass === "actor-subtract" || srcClass === "fas fa-minus";
    if (isPortrait || isHoverIcon) {
      const app = game.users.apps.find(
        e => e.id === game.i18n.localize("EB.id")
      );
      let name = event.srcElement.title;
      let actorExists;

      const parentClass =
        event.srcElement.parentElement.parentElement.classList.value;
      const parentParentClass =
        event.srcElement.parentElement.parentElement.parentElement.classList
          .value;
      if (
        parentClass === "group-field ally-field" ||
        parentParentClass === "group-field ally-field"
      ) {
        actorExists = this.allies.find(e => e.name === name);
        if (actorExists) {
          let ix = this.allies.findIndex(e => e.name === name);
          this.allies.splice(ix, 1);
        }
      } else if (
        parentClass === "group-field opponent-field" ||
        parentParentClass === "group-field opponent-field"
      ) {
        actorExists = this.opponents.find(e => e.name === name);
        if (actorExists) {
          let ix = this.opponents.findIndex(e => e.name === name);
          this.opponents.splice(ix, 1);
        }
      }
      app.calcXPThresholds();
      app.calcRating();
      app.render();
    }
  }

  /**
   * Clears list of allies and opponents.
   *
   * @param {*} event
   * @memberof EncounterBuilderApplication
   */
  _onClickButton(event) {
    event.stopPropagation();
    const app = game.users.apps.find(e => e.id === game.i18n.localize("EB.id"));
    app.allies = [];
    app.opponents = [];

    app.calcXPThresholds();
    app.calcRating();
    app.render();
  }
}
