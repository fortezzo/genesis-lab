# Evolution Simulator — Build Plan

Nov 7, 2026 · Christian Fortezzo

Genesis Lab is a browser ecosystem where creatures with neural-network brains evolve by themselves. This plan takes it from an empty folder to a live GitHub link in about 10–12 hours over five sessions. Sections 4–10 are the detailed spec the builder follows; the rest is for you.

## 1. At a glance

| Item | Plan |
| --- | --- |
| What | A living ecosystem in the browser where creatures with neural-network brains evolve by themselves |
| Name | Genesis Lab |
| World | A round glass lab terrarium seen from directly above, under dim lab lighting |
| Look | Glowing cyan-to-blue bugs and green sprouts on navy-tinted soil; predators glow magenta-red |
| Runs on | Any modern browser, laptop or phone, with no install, accounts or API keys |
| Built with | Plain JavaScript and HTML Canvas, with the neural networks written from scratch |
| Live link after launch | fortezzo.github.io/genesis-lab |
| Total time | About 10–12 hours: a setup step plus 4 build sessions |
| Builder | Claude, in your Genesis Lab PowerShell tab, working only inside the Genesis Lab folder |
| Your role | Director and tester: you play it, judge it and say what to change, with no coding |

## 2. Vision, audience and success

Genesis Lab should make people ask "how did you build that?" within 10 seconds of opening the link.

**Tagline:** Every creature has a brain. None of them were programmed. Watch them learn.

**The three jaw-drop moments**

1. **The first 10 seconds:** the screen fades in on a dim glass terrarium full of glowing bugs that already looks expensive.
2. **Minute 5:** creatures that bumped into walls now beeline for food, and nobody taught them.
3. **The click:** select any creature and its brain opens up, neurons firing live as it hunts.

After that, predators appear by themselves, species rise and go extinct, and the lab log tells the story.

**Who it's for**

- **Recruiters and employers:** proof you can take an ambitious idea from plan to shipped product.
- **Engineers:** neural networks and evolution written from scratch, with no AI libraries.
- **Your social audience:** a mesmerizing clip that's easy to share.

**Launch checklist: all of these must pass**

- [ ] Opens from the live link in under 3 seconds on a laptop and a phone
- [ ] Runs at 60 fps with 300 creatures on a typical laptop, and 30 fps or better on a phone
- [ ] Foraging skill at least doubles within 10 simulated minutes (5 minutes of watching at the default 2x speed), and the chart shows it
- [ ] Predators evolve on their own in at least 3 of 5 worlds within 20 simulated minutes
- [ ] A stranger can explain what's happening after 30 seconds, with no help
- [ ] Runs for 1 hour unattended without crashing, freezing or slowing down
- [ ] The README has a looping demo GIF and a working "Try it live" link, and the repo is pinned on your profile

**What it is not**

- Not an exact biology model. It's inspired by real evolution and tuned to be watchable.
- Not a game you win or lose. It's a sandbox you watch and mess with.
- No servers, logins, payments or AI services. Everything runs on the visitor's device.

## 3. How it works, in plain English

Picture a glass terrarium on a lab bench, sped up a million times: nobody designs the behavior, and the world selects it.

**The life loop** (drawn as a diagram in the online doc):

```text
Start: 90 random creatures
  -> 1 See:       5 view slices spot food, creatures and the glass wall
  -> 2 Think:     a neural network turns senses into decisions
  -> 3 Act:       walk, turn, bite, or try to have a baby
  -> 4 Survive:   moving and thinking cost energy; eating pays it back
                  (energy runs out -> the creature dies and makes room for others)
  -> 5 Reproduce: well-fed adults split off a baby that copies them
  -> 6 Mutate:    copies of DNA and brain change a tiny bit at random
  -> back to 1 See

In the middle of the loop: SELECTION.
Better foragers live longer and have more babies, so their changes spread.
```

Read it from See onward: one lap is one lifetime, and selection is why the next lap goes a little better.

Most random changes do nothing or hurt. Now and then a baby is slightly better at finding food, so it lives longer and leaves more babies. Hundreds of generations later, those tiny gains add up to creatures that hunt, flee, school together and split into species.

## 4. The world

The terrarium is a 4,000-unit-wide circle of soil where sprouts grow under drifting heat lamps, and the population stays between 20 and 400 creatures.

**The terrarium**

- A round glass lab terrarium, 2,000 units in radius, seen from directly above under dim lab lighting. One unit is 0.1 mm, so the terrarium is 40 cm across and a typical bug is about 2 mm long.
- The floor is dark soil with patches of moss, tinted toward the navy palette.
- The glass wall is the edge, and it's a soft wall: creatures that touch it are pushed back and burn extra energy.
- A scale bar in millimeters (for example "10 mm") updates as you zoom, for a real-lab feel.

**Time**

- The simulation runs in fixed steps of 60 ticks per simulated second, separate from drawing, so it behaves the same on fast and slow devices.
- Speeds: pause, 1x, 2x (the default), 4x, 16x and Max, which runs as many ticks as fit in about 12 ms per frame.
- Every world has a seed number. The same seed and settings always give the same starting world.

**Still air**

- There are no currents. Food stays exactly where it grows, and creatures move only by walking.

**Heat lamps over nutrient pads**

- 4 heat lamps shine warm pools of light onto nutrient pads. Sprouts grow fastest in a lamp's pool and rarely on open soil.
- The lamps drift slowly around the terrarium, and each one waxes and wanes in strength (between 0.4 and 1.6). When the lamps are brighter overall, more sprouts grow (`sproutGrowthFollowsLamps`), so the whole terrarium has richer and leaner spells and the population booms and dips with them.
- This creates geography: crowded feeding grounds, empty stretches, and migrations as the lamps move.

**Food**

| Food | Where it comes from | Energy | Behavior |
| --- | --- | --- | --- |
| Sprouts | Grow under the heat lamps, up to 1,500 at once | 25 | Grow in, sway softly, stay where they grew, and wither after 2 minutes if nobody eats them |
| Meat | Left behind when a creature dies (from Session 3) | 30% of the dead creature's stored energy plus a little for its body (0.3 × size²), in pellets of up to 30 | Chunky amber nuggets with a dark outline and a hot core (easy to see even in lamp light); decay after 60 seconds |

- **A sparse start:** a new world begins with only 60 sprouts (`sproutStart: 60`), so the first random creatures have to find food instead of bumping into it.
- **Wide, thin feeding grounds:** sprouts grow in patches about 700 units wide around each lamp (`lampSpread: 700`), and 20% of new sprouts come up on open soil (`sproutOpenGroundChance: 0.2`).
- Sprouts regrow at up to 38 per second at average lamp brightness when the terrarium is bare, slowing as it fills (`sproutGrowthRate: 38`). This is a balance: more food keeps adults alive longer, but with too much food steering toward it stops paying. (It was 34, then 32 after the speed trade-off; Session 3 raised it to 38 because bugs now eat with their mouths, which finds less food by luck, and well-fed prey escape hunters more often.)
- **No wasteful grazing:** a bug only eats a sprout it has room for (`eatOnlyWithRoom`). Nearly full bugs used to nibble every sprout they touched and waste most of it, stripping the terrarium; now they leave it for hungry bugs and babies.
- **Eating with the mouth (Session 3):** food must touch the front of a bug's head (`eatWithMouth`, a mouth circle 0.35 × its radius plus the food's size, at the tip of the head), not any part of its body. See section 5.

**Population limits**

- Start: 100 random creatures (`startCreatures: 100`). With 60, the first minutes often looked empty: many worlds dipped to about 20 bugs. It was 90 until Session 3; with the mouth, random brains find less food by luck, and 100 keeps the start as lively as before.
- Floor: below 20 creatures, new primitive creatures wander in, so the world never dies. The lab log records each arrival.
- Settling in: every primitive creature (the 90 starters and each newcomer) arrives with a full tank (`startEnergy: 1.0`) but must wait 30 seconds before it can have a baby (`primitiveSettleTime: 30`). The wait keeps minute 1 a fair measure of random brains, instead of one lucky family multiplying. The full tank matters because the air is still: nothing drifts a newcomer into food, so it needs the fuel to walk to a feeding ground. (The ocean version used 90%; in the terrarium that caused twice as many early population crashes.)
- Cap: 400 creatures on laptops and 150 on phones. At the cap, nobody can reproduce until there's room, and each free place goes to the best-fed creature that wants a baby (`capBestFed`). Without that rule, a free place went to whoever happened to come first, and evolution stalled once the terrarium was full.
- The population still touches the cap in most minutes after minute 10, with dips to about 180-280 in between. Session 3's predators help only a little: over an hour, the terrarium is at the cap in about 61% of minutes with meat-eaters against 76% without them (10 worlds), with real booms and crashes when they multiply. Hunters strong enough to hold the population well below the cap (at the cap in only 25% of minutes) also cut the life of a clicked adult to about 51 seconds, failing the health check in section 10, so the gentler setting was kept (`preyStruggle`, section 5). Raising hunting pressure again is a one-number change if the trade feels worth it.

## 5. The creatures

Each creature is a little glowing bug: 9 body genes plus a 390-number brain. Every trait has a cost, so no single design wins forever.

**Genes**

| Gene | Range | Helps with | Costs |
| --- | --- | --- | --- |
| Size (radius) | 6–24 units | Stores more energy, wins fights | Burns more energy every second, and needs more food to breed |
| Top speed | 30–150 units/sec | Reaching food first, escaping | Fast walking burns energy fast, and long fast legs are clumsy: above a top speed of 70, turning slows down |
| Turn speed | 1–6 radians/sec | Dodging and chasing | A small energy cost |
| Sight range | 60–320 units | Spotting food and danger early | Bigger eyes cost energy |
| Field of view | 60°–300° | Seeing all around | Each view slice gets wider and vaguer |
| Diet | 0 (plants) to 1 (meat) | Unlocks a food source | In-between diets digest both poorly |
| Baby investment | 20–60% of energy | Stronger babies | Leaves the parent weak |
| Mutation rate | 2–30% | Faster change | More broken babies |
| Clock speed | 0.1–2 cycles/sec | An inner rhythm for zigzags and patterns | None |

**Why in-between diets lose:** plant digestion = (1 − diet)² and meat digestion = diet². A pure plant-eater gets 100% from sprouts, but a 50/50 creature gets only 25% from each food. This jack-of-all-trades penalty pushes family lines to specialize, which is what splits predators from prey.

**How a meat-eater line starts (Session 3):** every primitive creature eats plants. Because in-between diets lose, evolution can't walk from plants to meat one small step at a time, so about 1 baby in 200 is born with the opposite diet from its parent (`dietSwitchChance: 0.005`), a rare gut switch. The new meat-eater keeps its parent's brain, which already steers toward food, and to a meat-eater a living plant-eater counts as food (below), so it starts chasing at once. It lives through its first minutes on the meat that every dead body leaves. Most switched lines die out; a few take hold.

**Senses: 25 brain inputs**

| Input | Count | Meaning |
| --- | --- | --- |
| Food per view slice | 5 | How close the nearest food is, weighted by how nutritious it is for this creature's diet (a strong signal: 0 to 8, see below). To a meat-eater, living plant-eaters count as food too (`preyFoodSense: 1`) |
| Creature per view slice | 5 | How close the nearest creature is |
| Size per view slice | 5 | That creature's size compared with mine: −1 much smaller, +1 much bigger |
| Glass wall | 3 | How close the wall is, plus two numbers for which way the center lies |
| Body | 4 | Energy, health, age and current speed |
| Inner clock | 1 | A wave that rises and falls at the clock-speed gene |
| Memory | 2 | Two values the brain wrote on the last tick |

The field of view is split into 5 equal slices. Each creature asks the spatial grid for nearby things, puts each one in its slice, and keeps the nearest per slice. That's far cheaper than true ray tracing and looks the same.

**Brain**

- A neural network written from scratch: 25 inputs → 12 hidden neurons → 6 outputs, with tanh activation.
- 390 numbers in total: 300 weights and 12 biases into the hidden layer, 72 weights and 6 biases into the outputs. They're stored in the DNA as one Float32Array.
- It runs once per tick for every creature.

**Actions: 6 brain outputs**

| Output | Effect |
| --- | --- |
| Thrust | Walk forward, from 0 to top speed |
| Turn | Turn left or right, up to turn speed |
| Bite | Close its pincers on whatever touches its mouth (only a meat-eater's bite does damage) |
| Reproduce | Try to have a baby, if it's mature and has enough energy |
| Memory 1 and Memory 2 | Store two values for the next tick |

**Walking is a choice:** the thrust output runs from −1 to 1 and must pass a dead zone of 0.3 (`thrustDeadZone: 0.3`) before the creature walks at all; above that, thrust scales smoothly up to top speed. A random brain often rests instead of wandering into food by luck, so a creature that walks toward food has really learned to.

**Legs, not fins:** bugs grip the soil. They speed up to the walking speed they want in about a fifth of a second (`walkAcceleration: 5`), stop even faster when they stop walking (`walkBraking: 14`), and never slide sideways when they turn (`legGrip: 14`). Nothing glides or drifts. A bigger body is not slower (`sizeSpeedPenalty: 0`): longer legs make up for the weight.

**No free speed:** long legs built for speed are clumsy. Above a top speed of 70, a bug turns more slowly: its turn rate is multiplied by (70 / top speed)^1.5 (`agilitySpeed: 70`, `agilityExp: 1.5`), so at 140 it turns at 35% of its turn gene. Without this, top speed was a free upgrade, because it costs nothing until it's used, and in every world it climbed to the 150 ceiling (38-96% of bugs at 140 or more by minute 60). Fast bugs now overshoot food and have to slow down to steer, so speed settles around 90-125 with real variety, leaving room for Session 3's predators to evolve a chase. An energy cost for leg muscles (paid even at rest) was tried first, but it had to be so high to stop the race that adults starved younger. The turn-speed gene still creeps slowly toward its own ceiling of 6 over an hour, as it did before; if Session 2 charts it, consider a similar trade-off for it.

**Turning takes effort:** legs can't reverse a turn instantly, so the actual turn eases toward what the brain asks for within about a tenth of a second (`turnResponse: 10`), and bugs swing smoothly instead of twitching. Turning also costs energy (`turnCost: 0.3`), so walking in endless circles is wasteful and turning toward food pays.

**Eating with the mouth (Session 3):** a bug eats food that touches the tip of its head, not its side or back (`eatWithMouth`). In every world, walking bugs learn to keep food at one spot in their view and turn toward it; in about a third of worlds that spot was 40° to one side, and they spiralled in on food, which worked almost as well when any part of the body could eat. With a mouth, pointing straight at food pays, and steering "clearly rises" by minute 10 in about 86% of worlds instead of 64% (80 worlds each). Turning speed, agility, food-sense strength and turn costs were all tried first and changed nothing.

**Strong food senses:** the five food inputs run from 0 to 8 instead of 0 to 1 (`foodSenseGain: 8`). With a weak signal, a newborn brain barely reacts to food, and mutation needed dozens of lucky steps to build steering, so in most worlds it never appeared in time. With a strong signal, random brains already react strongly to food (about half turn toward it and half away) and evolution only has to pick the right half. A test showed the world rewards steering hugely: 30 hand-built steering bugs dropped into an evolved population out-ate the natives two to three times and took over within 3 minutes. Nothing is pre-programmed: the direction of every response is still random at birth.

**Energy**

- Max energy grows with size squared: a size-10 creature holds 160 energy (`energyPerSize2: 1.6`), about six sprouts or 90 seconds of life without eating. A bigger tank rides out the gaps between meals, so adults live long enough to follow.
- Each second costs upkeep (by size²), walking (by speed² × size), eyes (by sight range × field of view) and a small thinking cost.
- Eating gives the food's energy × the creature's digestion for that food.
- Health is separate. Bites lower it, and it slowly regrows by spending energy.
- Old age: past 70% of a 4-minute lifespan, upkeep climbs until the creature dies and makes room.
- Every starting number lives in config.js with a comment, so balancing means editing numbers, not rewriting code.

**Fighting (Session 3)**

- With bite on and another creature touching its mouth, a creature deals damage per second based on its size × how well it digests meat (diet², so a plant-eater's bite does nothing): `biteDamage: 6`.
- Bigger targets take longer to bring down (health grows with size²), and biting costs a little energy per point of damage (`biteCost: 0.01`).
- Pincers hold: a victim up to 1.15 times the biter's size is held at the mouth and dragged along (`biteHoldSize`), and the biter walks at half speed while it drags it. Once the pincers close on a victim they stay shut for a second (`biteLock`), then open only when the bite output drops below −0.5 (`biteRelease`); in a crowd they keep biting the same victim. A bite never hurts the biter's own species, and a bitten bug can't heal until it gets away.
- A held victim struggles: at full energy it breaks free in about a fifth of a second, at half energy in twice that (`preyStruggle: 4.5`), so hunters mostly catch the hungry and weak, as real predators do.
- Every death leaves meat pellets: 30% of the dead bug's stored energy plus 0.3 × size² for its body, so scavengers can live on the dead.
- Meat-eaters look the part: they grow pincers and a spiky shell (see section 7).
- Why it took six changes (each found by tracing why hunts failed): a costly bite made evolution switch biting off; bodies don't collide, so hunters ran straight over their prey (the hold); a new meat-eater's bite reflexes are random, so it let go of prey the moment it was straight ahead (the lock and release rule); in crowds the pincers switched victims every tick; a final bite left a victim at −0.001 health and its healing saved it, so for a while only starving prey ever died; and once kills worked, whole bodies as meat fed hunters three times what they burned, so they boomed to 200-300 and wiped out their prey (small meals and the struggle fixed that).

**Babies**

- A creature can reproduce when its reproduce output is on, its energy is above 85% of max (`reproduceThreshold: 0.85`), and it's at least 10 seconds old. Waiting until it is well fed means a parent keeps a reserve after giving birth, and its baby starts with more energy.
- It must also wait 20 seconds between babies (`reproduceCooldown: 20`). Without this pause, parents churn out doomed babies and most creatures live only about 20 seconds. With it, the parent keeps eating while it waits, so each baby is born stronger.
- The baby gets the parent's baby-investment share of energy, and the parent pays a further 10% birth cost.
- Babies start at half size and grow to full size as they mature, so you can watch them grow.

**Mutation**

- Each gene changes with a chance equal to the mutation-rate gene: usually a nudge of about 10% of its range, and 1% of the time a big jump.
- Each brain number has the same chance: a nudge of about ±0.3, or a 0.5% chance of a fresh random value, kept within −4 to 4.
- The mutation rate mutates too, so evolution tunes its own speed.

**Deaths are tracked by cause:** starvation, eaten, old age or disaster.

## 6. Species and the story engine

Species form automatically when a family line drifts far enough from its founder, and the lab log turns each split, boom and extinction into a story.

**How a species forms**

- Every species remembers its founder's DNA.
- Genetic distance = the average gene difference (each gene scaled to its range) plus the average brain-number difference (also scaled), on a 0–1 scale.
- A baby more than 0.15 from its species' founder starts a new species, with itself as the founder (`splitDistance: 0.15`). The plan said 0.35, but families drift only about 0.006 a minute, so at 0.35 no species formed within an hour; at 0.15 the first ones branch off around minutes 10-15.
- Before founding a new species, a baby joins a living species of its diet whose founder is within 0.15, so two cousins that drift apart at the same moment stay one species. A baby born with the other diet (the gut switch) always starts a new species.
- The 100 starting bugs are one species, but each of them is compared with its own random DNA, since they aren't related to each other.
- A new species is announced in the lab log once it has 5 members alive at once, so one-offs that die at once don't flood it.

**Names**

- Each new species gets a generated Latin-style name, such as *Lumivora cyanea* or *Ferox noctis*.
- The first word hints at diet: gentle-sounding for plant-eaters, fierce for meat-eaters. The second is built from random syllables.

**Colors show family**

- A new species takes its parent species' color, nudged slightly, so related species look related.
- Plant-eaters stay in the cyan-to-blue range and meat-eaters in magenta-to-orange, so you can read the food chain from across the room. Green belongs to the sprouts alone, so food never looks like a creature.

**Lab log**

A live feed of short lines, for example:

- Gen 112 · New species: *Ferox lumen*, a meat-eater
- *Folivora prima* went extinct after 41 generations
- Population crash: 63% of life lost in the drought
- Record: specimen #4821 lived 6 minutes and had 23 babies
- Also (Session 3): the first gut switch ("specimen #163 was born a meat-eater, the first one"), hunting records, the last meat-eater dying out, crashes blamed on the drought, ice age, meteor or hunting, and everything done in god mode. Lines about a species can be clicked to ring its members in the terrarium.

**Champion**

- The champion is the living creature with the best score: babies × 3 + minutes alive.
- Follow champion flies the camera to it.

**Family tree (Session 3)**

- A branching timeline of species: each branch starts when a species appears and ends when it dies out.
- Branch thickness shows population. Living species glow; extinct ones fade to gray.
- Click a branch to highlight that species in the terrarium.
- Built in Session 3 as a tab in the charts drawer, next to the charts. Meat-eater branches carry small spikes, so diet reads by shape too; hovering a branch tells its story (when and from what it appeared, its peak, generations and kills). Only species that ever had 5 members at once are drawn.

## 7. Visual style guide

The look is a round glass terrarium on a lab bench at night, seen from directly above: glowing bugs on dark soil under warm heat lamps. Every screen should be good enough to screenshot.

**Palette**

| Role | Color | Hex |
| --- | --- | --- |
| Background, edges | Midnight navy | #050B18 |
| Background, center | Navy glow | #0A1630 |
| Soil | Navy-tinted dark soil | #131620 |
| Moss | Deep navy moss | #132628 |
| Plant-eaters, main accent | Neon cyan to electric blue | #22E5FF to #4A9DFF |
| Sprouts | Leaf green | #66DD4F |
| Heat-lamp light | Warm amber glow | #FFB46A |
| Meat-eaters, danger | Magenta-red | #FF3D6E |
| Meat, warnings | Amber | #FFB020 |
| Good news in the interface | Neon green | #39FF88 |
| Main text | Ice white | #CFE8FF |
| Secondary text | Steel blue | #6E87A8 |
| Panel borders | Faint cyan line | rgba(140, 200, 255, 0.15) |

**Creatures: little glowing bugs, seen from above**

- Soft glows from pre-rendered sprites with additive blending, so overlapping light blooms like the real thing.
- An oval body with a shell seam down the back, a small head, and a glowing abdomen like a firefly's lantern.
- Six small legs that patter in a tripod gait, faster as the bug walks faster, and stop when it stops.
- Two eyes on the head, with pupils that glance toward the food it is looking at, and two short antennae that twitch and lean toward food.
- From Session 3, meat-eaters get pincers and a spiky shell, so diet shows in shape, not just color.
- Faint glowing footprints behind walking bugs, which fade after a couple of seconds.
- A ring flash at birth, a pulse when eating, and a burst of particles at death.

**Bugs and food must never look alike, at any zoom**

- Bugs are bright cyan to blue, with a white-hot core and a glow that never shrinks below about 12 pixels on screen, so even babies stay visible when zoomed all the way out.
- Zoomed out, a bug's body is drawn at least about 2.6 pixels in radius (`creatureMinBodyPx`), so bugs that evolve small (they tend to shrink from about 10.5 to 8.5) still read as little glowing ovals, not dots.
- Sprouts are clearly green, smaller and dimmer: a faint green speck from afar, a tiny two-leaf seedling up close.

**The world**

- A navy lab bench in dim light, with a dark vignette at the edges.
- The terrarium floor: dark soil with patches of moss, tinted toward navy, with fine soil grain that appears as you zoom in. From the whole-terrarium view the moss is softer and darker (a second, blurrier floor painting), so it never looks like camouflage and the bugs stand out; it blends into the detailed floor as you zoom in.
- The glass wall: a subtle glass rim with a soft highlight, and a shadow where the wall meets the soil.
- A faint measuring grid, as if etched on the glass, that scales with zoom.
- Heat lamps: warm pools of light with a gentle shimmer, over darker nutrient pads.
- Dust motes floating in the lamp light at two depths, for a 3D parallax feel.
- Sprouts that grow in, sway softly and wither.
- The app opens with the whole terrarium visible below the top bar, never cropped.

**Interface**

- Frosted-glass panels: a blurred background, a thin cyan border and 12 px rounded corners.
- Fonts: Space Grotesk for headings, Inter for text and JetBrains Mono for numbers. All are free and stored in the project, so they work offline.
- Small all-caps labels with wide letter spacing, such as POPULATION and GENERATION.
- Numbers count smoothly to new values instead of jumping.

**Motion**

- Camera moves ease in and out; nothing snaps.
- Panels slide in over about 200 ms.
- A reduced-motion setting turns off footprints, the lamp shimmer and camera easing. Built in Session 4: it follows the system's reduced-motion setting unless changed in Settings, and also stops swaying sprouts, screen shake and interface animations.

**Accessibility**

- Diet shows by shape as well as color, for color-blind viewers.
- Panel text meets WCAG AA contrast.
- Everything works with a mouse, touch or keyboard.

## 8. Interface and controls

The terrarium fills the screen, panels slide in only when needed, and one click on any creature opens the showpiece: its live brain.

**Intro screen**

- A black screen; GENESIS LAB fades in, then the tagline.
- Two buttons: Begin experiment, and Advanced for the seed and world settings.
- After starting, three quick tips: drag to move, scroll to zoom, click a creature to see its brain.
- Built in Session 4: the simulation waits behind the intro and starts at Begin, so minute 0 is the moment you start. A "Guided story" switch under the buttons is on for first-time visitors (see below).

**Guided story (Session 4)**

- A 3-5 minute documentary of the visitor's own world, starting at Begin experiment. Every chapter is triggered by a real event in this run: the start ("100 random brains. No instructions."), foraging skill clearly rising (at least 2× and 1.8× the first minute's), a meat-eater born by a gut switch, the first hunter species (10 meat-eaters alive), the first new plant-eater species, a big crash, a record by an evolved bug that had babies, and, if all of that happened in under about 3 minutes, the champion.
- Each chapter shows a big caption while the cinematic camera flies to the bug or event, and time slows to 1x; between chapters time runs at 6x (16x after 2.5 minutes), with a small "fast-forwarding" note. It ends by 5 real minutes or 20 simulated minutes; chapters that never happened are skipped, and if no hunters evolved the ending suggests Predator drop.
- "Skip story", or any click, tap, scroll or key, hands control back at 2x. It plays once (remembered in the browser) and Settings can replay it in a new world. It works on phones and with reduced motion (the camera cuts instead of flying). It only moves the camera, sets the speed and shows captions: the simulation is bit-identical with it on.

**Laptop layout**

- Top bar: logo, generation, population, species count and speed controls.
- Generation shows the highest generation ever reached, so it never goes backwards when an old family line dies out.
- Foraging skill shows "5.3× random brains", a pill like "▲ from 1.1×" (the first minute's value, when every bug still had a random brain), and a short line a stranger understands: "how much faster they find food than random brains in the same spots".
- Left panel (collapsible): world controls and settings, plus god mode from Session 3. Built in Session 3 as the "Lab" panel (key G) with two tabs: God mode (Drought, Sprout bloom, Ice age, Meteor strike, Predator drop, Paint food, with countdowns while effects last) and the Hall of Fame. Settings arrive in Session 4.
- Right panel: the inspector, opened by clicking a creature.
- Bottom drawer: charts and the lab log.

**Phone layout**

- The terrarium full screen, a slim top bar, and a bottom sheet with tabs: Inspector, Charts, Log and World.
- Pinch to zoom, drag to pan, tap to select.

**Inspector**

- Name and number (for example *Lumivora cyanea* #4821), species color, generation and age.
- Energy and health bars, and a plant-to-meat diet meter.
- Every gene as a mini bar compared with its species average.
- Babies, kills, food eaten, and the cause of death if it dies while selected.
- Parent and children links you can click to jump between them.
- The camera follows whoever is selected. Save to Hall of Fame arrives in Session 3.
- If the bug you are following dies, nothing vanishes silently: a note says what happened (for example "Specimen #1750 starved at age 1:40"), a fading marker shows where, and a button offers to follow its child, or else its nearest living relative (grandchild, sibling, parent, cousin). After 6 seconds it switches automatically (`followNextSeconds`), unless you press "Stay here".

**Brain viewer**

- Inputs on the left with small icons, 12 hidden neurons in the middle, actions on the right.
- Lines show connections: thicker means stronger, cyan excites and magenta calms.
- Neurons glow with live activity, and pulses travel along strong connections as the creature thinks.
- Hover any neuron to see its name and current value.
- A radar under it shows the 5 view slices, so you see what the creature sees.

**Charts**

- Population by species over time, as a flowing stacked streamgraph in species colors.
- Average traits over time: speed, size, sight range and diet.
- Foraging skill, the proof that they're learning: evolved bugs against random brains in the same spots at the same moment (see section 10). Draw two lines, meals per hungry minute for the evolved bugs and for the random-brain ghosts, with the ratio between them as the headline. The ghost line falls as food gets scarce; the evolved line stays high; the gap between them is the learning.
- Steering: how often a walking bug that can see food is pointed at it, next to what luck alone would give.
- Births and deaths per minute, split by cause.
- All drawn by the project's own lightweight chart code, to match the look.

**Keyboard shortcuts**

| Key | Action |
| --- | --- |
| Space | Pause or resume |
| 1, 2, 3, 4, 5 | Speed 1x, 2x, 4x, 16x, Max |
| F | Follow the champion |
| C | Charts, family tree and lab log (Session 2) |
| G | God mode and the Hall of Fame (Session 3) |
| V | Cinematic camera (Session 3) |
| M | Mute or unmute (Session 4) |
| Esc | Put away an armed god-mode tool, stop the cinematic camera, or deselect |
| H | Hide all panels (screenshot mode) |
| P | Save a screenshot |
| Backtick | Debug overlay |

**Settings**

- Creature cap, sprout growth rate, mutation strength and world size.
- Quality: auto, high, medium or low.
- Sound starts on at a quiet volume after Begin, with mute and a volume slider (Session 4).
- Built in Session 4 as a Settings tab in the Lab panel (also the gear button in the top bar): volume and mute, quality, reduced motion, replay the guided story, save and load the whole world as a .json file, and a new world with a seed, creature cap (50-600), sprout growth (×0.5-2), mutation strength (×0.25-3) and world size (small, normal, large). World settings take effect in the next world and are remembered; the usual values leave every config.js number unchanged.
- The top bar measures itself and steps down until it fits (key hints, then button names, then tighter spacing, then the skill explanation, then the speed buttons on a second row), checked at 1024-1920 px wide.
- Reduced motion, and New world with an optional seed.

## 9. Technical architecture

Genesis Lab is plain JavaScript in classic script files, so it runs by double-clicking index.html, with no server, build step or libraries.

**System map** (drawn as a diagram in the online doc):

```text
config.js (every tunable number)              --numbers-->        Simulation
Main loop (fixed 1/60 s ticks, then 1 frame)  --ticks-->          Simulation
Headless test (no drawing, prints a report)   --runs it fast-->   Simulation

Simulation (js/sim, pure logic, never draws):
  World (terrarium, heat lamps, sprouts) · Creatures (genes, senses, brains, energy)
  Species (founders, names, family colors) · Stats and events (chart samples, lab log lines)

Simulation  --nearby queries-->           Spatial grid (finds neighbors fast)
Simulation  --reads state-->              Renderer (glow sprites, camera, background, effects)
Simulation  <--stats out, commands in-->  Interface (top bar, inspector, brain viewer, charts)
Interface   --saves-->                    Storage (settings, Hall of Fame, saved worlds)
```

Because the simulation never draws, the headless test can run it flat out with no graphics, and drawing could later move to WebGL without touching it.

**Stack**

- Plain JavaScript, HTML and CSS: no frameworks, AI libraries, build tools or outside CDNs.
- Drawing: HTML Canvas 2D with cached glow sprites and additive ("lighter") blending for a bloom look. One renderer module holds all the drawing code.
- Scripts load in order as classic files under one global namespace, GL. That's what makes double-click work, because browsers block module scripts and web workers on local files.

**Folder layout**

```text
genesis-lab/
  index.html            the app
  PLAN.md               this plan, exported from the doc
  README.md, LICENSE (MIT), .gitignore
  css/main.css
  js/config.js          every tunable number, with a comment
  js/core/              rng, math, noise, spatialGrid, loop
  js/sim/               genome, brain, creature, food, world, species, names, stats, events
  js/render/            renderer, sprites, camera, background, effects
  js/ui/                hud, intro, inspector, brainView, charts, labLog, controls,
                        settings, godMode, hallOfFame, familyTree, cinematic,
                        storyMode, phoneTabs
  js/sim/save.js        save and load a whole world (Session 4)
  js/audio/sound.js
  js/main.js            starts everything
  assets/               fonts, icons, social-preview.png
  tools/headless.html   runs the sim with no drawing and prints a report
  docs/                 demo.gif and screenshots
```

**Each tick, in order**

1. Rebuild the spatial grid.
2. Sense: fill every creature's 25 inputs.
3. Think: run every brain.
4. Act: move, turn, eat and bite.
5. Metabolism: charge energy costs, heal and age.
6. Births and deaths.
7. Grow and wither food; drift the heat lamps.
8. Every half simulated second, sample stats for the charts.

**Performance**

- A spatial hash grid with 160-unit cells, so each creature checks only nearby cells instead of every other creature.
- Object pools for creatures, food and particles, and no new objects inside a tick, to avoid garbage-collection stutters.
- Budget with 300 creatures and 1,500 sprouts on a typical laptop: under 3 ms per tick and under 8 ms per drawn frame, so the default 2x speed (2 ticks per frame) holds 60 fps.
- Only what's on screen gets drawn. If fps stays under 45 for 3 seconds, footprints, particles and dust motes scale down automatically. The first 5 seconds after loading are ignored, and quality comes back once fps holds at 50 or more for 4 seconds, so a laptop running at 52-54 fps recovers. If going back up makes it slow again at once, the next try waits twice as long (up to a minute).
- The soil and moss are painted once into a texture when a world starts, so the floor costs one image per frame.
- Phones get lower caps, fewer particles and no lamp shimmer by default.

**Saving**

- Settings and the Hall of Fame go in localStorage, wrapped in try/catch so blocked storage never breaks the app.
- Creature share codes pack genes and brain numbers into bytes, then into base64 text.
- A whole world saves as a downloadable .json file and loads back from it.

**Debug overlay (backtick key)**

- Shows fps, tick and draw times, creature and food counts, grid cells, and the selected creature's view slices.

**Supported browsers**

- Current Chrome, Edge, Firefox and Safari on desktop, Safari on iPhone and Chrome on Android.

## 10. Balancing and testing

Balance makes or breaks an evolution sim, so every change is proven with a headless test run instead of judged by eye.

**Tuning strategy**

1. Get foraging to evolve reliably with plant-eaters only (Sessions 1 and 2).
2. Then switch on meat-eating and tune until predators and prey can live side by side (Session 3).
3. Change numbers in config.js rather than the code's logic wherever possible.

**Headless test (tools/headless.html)**

- Runs the simulation at full speed with no drawing, for example for 20 simulated minutes, across several seeds.
- Prints a report, minute by minute and as a summary: population, sprouts, foraging skill, the older "times faster than luck" score, food found per bug, steering (with what luck would give), births and deaths, generation, average size, and top speed (average, spread and share at 140 or more). It also reports how long a clicked adult lives on (median, average, the quickest quarter), the share of babies that never ate, how old bugs are when they die, the lowest population in minutes 1-5, the minute the population first reaches 150, and a brain-swap check (below).

**How foraging skill is measured: evolved bugs against random brains, same spots, same moment.** A control group of 64 invisible "ghost" bugs (fewer on phones) runs alongside the real ones. Each ghost copies a real grown bug's body, place, heading and energy, gets a fresh random brain, and walks around for 60 seconds counting the sprouts it would have eaten, then becomes a fresh copy of another bug. Ghosts get hungry and full like real bugs, but they never eat real food, never breed, and nothing can see them. They draw their random numbers separately, so the real simulation is exactly the same with or without them. Foraging skill = how fast hungry grown bugs find food (meals per minute spent hungry) ÷ how fast hungry ghosts do, over the last minute. Food shortages and crowding hit both sides equally, so they cancel out. At minute 1 every bug has a random brain, so skill starts at about 1×.

Two older measures stay in the report for reference. "Times faster than luck" (meals ÷ what blind walking would find) rises as food gets scarce even for random brains, because a brain that reacts to food at all beats blind walking by more when food is sparse: brains that learned nothing went from about 1-2× at minute 1 to 2-6× at minute 30. "Food per bug per minute" always peaks during the population boom and then falls.

**Brain-swap check.** At minutes 1, 10, 30 and 60 the report copies 40 grown bugs (same bodies, same places, same terrarium) with fresh random brains, measures them for 60 seconds next to the evolved bugs, and shows meals per minute, times faster than luck, and foraging skill for both groups. Random brains must score about 1× foraging skill at every one of those minutes; if they don't, the proof is unfair.

**How steering is measured.** Every half second: of the bugs that are walking and can see food, what share are pointed at the food (within 20° of straight ahead)? Luck alone gives the cone's share of each bug's field of view, which is reported next to it, because bugs that evolve tunnel vision look "pointed" without steering at all. Steering "clearly rises" when minute 10 is at least 10 points above minute 1 and above luck.
- The builder runs it after every balance change and shows you the numbers.

**Health checks: must pass at the end of each session**

- Foraging skill at least doubles within 10 simulated minutes, in 3 of 3 seeds.
- Steering toward food clearly rises by minute 10, in 3 of 3 seeds.
- A clicked adult (after minute 3) usually lives at least another 60 seconds: the median across worlds is 60 s or more.
- Fewer than about 20% of babies die without eating once.
- The start stays lively: the population stays above about 40 in minutes 1-5 and reaches 150 by about minute 4.
- Random brains score about 1x foraging skill in the brain-swap check at minutes 1, 10 and 30 (averaged over seeds 1-5; single worlds are noisy).
- Over 60 simulated minutes, average top speed stays well below the 150 ceiling with real variety (minute 60: about 90-125 per world, few bugs at 140 or more).
- Population stays between 25% and 100% of the cap for 30 simulated minutes, once it has boomed to half the cap. (The check starts there because a world now begins with 90 bugs, so it can pass a quarter of the cap within a minute and dip below it again while the starters die out.)
- Once creatures have evolved, the population floor kicks in less than once per 10 simulated minutes.
- From Session 3: a meat-eater species appears in at least 3 of 5 seeds within 20 simulated minutes, and prey survive alongside it. The headless test counts it when one meat-eater species has 10 or more members alive at once by minute 20 and the plant-eaters never fall below 100 (a quarter of the cap) from then on. It also reports when the first meat-eater was born, how many were alive at most, how many bugs were eaten, how often the population sat at the cap, and how many babies that never ate were eaten rather than starved.

**Your test checklist, every session**

- [ ] Double-click index.html: it opens with no errors
- [ ] Watch 5 minutes at the default speed: do they visibly get better?
- [ ] Try every new button and shortcut
- [ ] Take 3 screenshots: would you post them?
- [ ] Leave it at 16x for 20 minutes: is it still smooth?
- [ ] From Session 4, open the live link on your phone
- [ ] Send feedback as Off, Boring, Ugly and Confusing, using the feedback prompt in section 12

**Stranger test, before launch**

- Show 2–3 friends with no explanation. After 30 seconds, ask what they think is happening.
- If they can't say, fix the intro or the visuals before launch.

## 11. Build sessions

Five sessions take Genesis Lab from an empty folder to a live link, and each one ends at a gate that must pass before the next starts.

**Roadmap** (drawn as a diagram in the online doc):

```text
Session 0 · Setup        (20–30 min)  -> Gate 0: opens on double-click; first commit
Session 1 · It lives     (2–3 hours)  -> Gate 1: foraging doubles in 3 seeds; 60 fps
Session 2 · Their minds  (2–3 hours)  -> Gate 2: brain viewer gets a whoa; charts show it
Session 3 · Drama        (2–3 hours)  -> Gate 3: predators in 3 of 5 seeds; prey survive
Session 4 · Launch       (2–4 hours)  -> Gate 4: launch checklist passes; live link works
```

Don't start a session until the gate before it passes. The times are estimates; the gate matters more than the clock.

**Session 0 · Setup (you, 20–30 minutes)**

1. Create the project folder (yours is OneDrive\Attachments\Genesis-Lab).
2. Put this plan in the folder as PLAN.md.
3. Open a new PowerShell tab in that folder, name it Genesis Lab if your terminal allows, and start Claude.
4. Paste the Session 0 prompt from section 12.

**Gate 0:** index.html opens on double-click and shows GENESIS LAB on navy, git is set up, and the first commit is saved.

**Session 1 · The simulation lives (2–3 hours)**

- [ ] config.js with every starting number
- [ ] Seeded random numbers, smooth noise, the spatial grid and the fixed-step loop
- [ ] The terrarium, heat lamps over nutrient pads, and sprout growth (no currents)
- [ ] Creatures: genes, 5-slice senses, the 25-12-6 brain, walking, energy, health, aging and death
- [ ] Babies with mutation, growing from half size
- [ ] Population floor and cap
- [ ] Drawing: soil and moss, glass rim, etched grid, lamp light and dust motes, glowing bugs with legs, eyes, antennae and footprints, sprouts, birth and death effects
- [ ] Pan, zoom, click to select and follow, plus pause and speed buttons
- [ ] Top-bar counters: generation, population and foraging skill
- [ ] tools/headless.html

**Gate 1:** foraging skill at least doubles within 10 simulated minutes in 3 seeds, it runs at 60 fps with 300 creatures, and you can see them learning. Commit: "Session 1: core simulation and look".

**Between Sessions 1 and 2: the terrarium switch.** Session 1 first built an ocean in a culture dish. Before Session 2 the world became the lab terrarium described here: a reskin plus still air and walking, with the brains, genes, evolution, energy, babies and headless test unchanged. The foraging gate was re-run and still passes: x4.40, x4.19 and x4.07 in seeds 1–3 (the ocean gave x2.61, x2.76 and x3.03). The one balance change was a full starting tank (`startEnergy: 1.0`, section 4). The ocean version is saved as the git tag `ocean-version`. Commit: "Switch to lab terrarium world".

**Terrarium feedback round (still before Session 2).** Testing showed bugs dying too young to follow, foraging skill peaking early and then falling, unreliable steering, a generation counter that went backwards and an empty start. The fixes, all in config.js and sections 4, 5 and 10: foraging skill measured against luck; strong food senses; turning that takes effort; bigger energy tanks; breeding only when 85% full; no wasteful grazing; more sprout growth; 90 starting bugs; and the best-fed rule at the cap. Results on 20 worlds (10 simulated minutes each), before → after: steering clearly rose in 7 → 16; skill doubled in 16 → 18; a clicked adult lived a median of 33 s → 69 s; babies that never ate 33% → 12%; the lowest population in minutes 1-5 was 18 → 53; and the population reached 150 by minute 4 in 7 → 18 worlds (all 20 by minute 5). Bugs still shrink a little over 30 minutes (about 10.5 to 8.5, as before), so small bugs are now drawn bigger when zoomed out. Commit: "Terrarium feedback: lifespan, skill, early game".

**Fair learning proof and speed trade-off (still before Session 2).** A brain-swap test showed that "times faster than luck" rose partly because food got scarce: bugs given fresh random brains went from about 2x luck at minute 1 to 2.7x at minute 30 without learning anything. Foraging skill now compares evolved bugs with invisible random-brain ghost bugs in the same spots at the same moment (section 10), and random brains score about 1x at minutes 1, 10 and 30 (0.93x, 1.21x and 0.97x on average over seeds 1-5). Speed was a free upgrade and climbed to the ceiling; fast legs are now clumsy (section 5), and at minute 60 average top speed is 92-126 per world instead of 136-148. The lamps now drive the total food supply, so the population dips to about 220-260 and climbs back instead of staying near the cap. Lifespans, babies, steering and the gate all still pass. Commit: "Fair learning proof and speed trade-off".

**Session 2 · See inside their minds (2–3 hours)**

- [x] Inspector with genes, bars, stats, and parent and children links
- [x] Live brain viewer: labeled inputs and outputs, glowing neurons, traveling pulses
- [x] Radar of the 5 view slices
- [x] Charts drawer: population, average traits, foraging skill, births and deaths
- [x] Lab log: records, booms and crashes
- [x] Keyboard shortcuts, champion and follow mode
- [x] Frosted-glass panels, fonts and smooth number tickers

**Gate 2:** clicking a creature makes you say "whoa", the charts clearly show foraging rising, and open panels don't drop the frame rate. Commit: "Session 2: inspector, brain viewer, charts".

**Session 2 notes.** The simulation is unchanged: the same seeds give bit-identical results before and after (checked on 5 worlds × 30 minutes), and the gate still gives ×4.95, ×6.34 and ×4.87 in seeds 1–3. Small additions beyond this plan: the C key and a top-bar button open the charts drawer (which also holds the lab log); F and a Champion button fly to the champion, who wears a small gold crown; the selected bug's field of view is drawn faintly on the soil, lighting green where it sees food; hovering a neuron highlights its connections and says, in words, what is exciting or calming it; a new lab log line shows briefly at the bottom while the drawer is closed, and log lines about a living specimen can be clicked to fly to it; the "it died" notice moved from the top chip into the inspector, where the dead bug's brain goes dark. Species names, species colours in the population chart and "average of its species" in the inspector wait for Session 3's species; until then genes are compared with the average of all living bugs. If drawing quality drops on a slow device, the panels give up their live blur (solid glass) to protect the frame rate.

**Session 2 feedback round.** The bite action is dimmed and labelled "bite (not yet)" until meat-eaters exist, with no live glow, bar or pulses (hovering it explains why). The inspector fits short screens: energy, health and diet share one row, the legends moved into the section headings, and the brain and radar shrink with the screen height, so both always show without scrolling (checked at 1440×900, 1366×768 and 1280×720); genes, life and family sit one smooth scroll below, with a "genes, life and family" button. Also: "Stay here" after a death now keeps the panel open on the bug that died (it used to close it), the Kills cell says "not yet", and if nobody has clicked a bug after 40 seconds a one-time tip suggests it.

**Session 3 · Predators, species and god mode (2–3 hours)**

- [x] Meat-eating, biting, meat pellets and the predator look: meat-eaters grow pincers and a spiky shell
- [x] Meat pellets must stay easy to see inside the lamp light: amber meat on warm orange light can disappear, so give meat its own shape and a dark outline or brighter core, and check it in a screenshot under a lamp
- [ ] Predators should keep the population below the cap, with booms and crashes (section 4), and have a chase to evolve now that prey speed varies (section 5). Partly: hunters chase and there are booms and crashes, but they only cut the time at the cap from about 76% to 61% of minutes (see the notes below)
- [x] Species detection, generated names and family colors
- [x] Species streamgraph and family tree
- [x] Lab log lines for new species, extinctions and crashes
- [x] God mode: Drought, Sprout bloom, Meteor strike (click to drop), Ice age, Predator drop and Paint food
- [x] Hall of Fame: save up to 20 creatures, spawn them back, and share them as codes
- [x] Cinematic camera that cruises between births, hunts and crowds

**Gate 3:** predators appear on their own in at least 3 of 5 seeds within 20 simulated minutes, prey survive, and you can tell a story from one run. Commit: "Session 3: predators, species, god mode".

**Session 3 notes.** The gate passes. In tools/headless.html in Chrome, a meat-eater species appeared by itself (10 or more alive at once) within 20 simulated minutes, with plant-eaters never dropping below 100 from then on, in 4 of seeds 1-5 (seed 2 at minute 12.7, lowest prey count afterwards 293; seed 3 at 13.1, 277; seed 4 at 7.6, 285; seed 5 at 12.5, 329; in seed 1 meat-eaters never grew past 7) and in 18 of 20 worlds. Every earlier health check still passes in Chrome: foraging skill doubled in 20 of 20 worlds; steering clearly rose in 17 of 20; a clicked adult lived a median of 73 s (20 worlds, 20 minutes) and 64 s (seeds 1-5, 60 minutes); at most 14% of babies never ate; the population stayed in its band in every world, with no floor arrivals after minute 10; at minute 60 average top speed was 73-108 per world with no bugs at 140 or more. The three Session 2 watch items: seed 4's fast bugs are gone (top speed 76 with 0% at 140+ at minute 60, was 126 with 26%); steering rises in 17 of 20 worlds (was 14), and in 86% of 80 worlds in the faster Node test (was 64%); seed 2's babies that never ate are down to 12% (was 21% at 10 minutes, 17% at 60). The brain-swap check reads 0.83, 0.86 and 1.21 at minutes 1, 10 and 30 (seeds 1-5). Minute 1 now reads about 0.85 in most worlds because the check copies the starting bugs at second 0, while the ghost bugs are refreshed during minute 1 with copies of bugs that have already walked to food (with a mouth, where a bug starts matters more); giving the ghosts the same start fixed it but exposed an opposite bias (real bugs that eat have babies and are hungry again right at the food, ghosts never breed), so the tested version was kept. Changes beyond this plan, all in config.js: eating with the mouth (section 5), 100 starting bugs and sprout growth 38 (section 4), species split at 0.15 (section 6), the gut switch, prey as food, and the pincer, struggle and meat rules (section 5). Also: the top bar counts species and meat-eaters (◆); G opens the Lab panel and V the cinematic camera; a Hall of Fame creature brought back rejoins its own species if it still lives in this world; meteor strikes leave craters and their victims' bodies as meat; the inspector compares genes with the species average and names the hunter when a bug is eaten.

**Session 4 · Polish and launch (2–4 hours)**

- [x] Intro screen, tips, settings panel and reduced motion
- [x] Sound made in code: ambient hum, birth blips, extinction chime and interface clicks, starting quietly after Begin, with a mute button
- [x] Phone layout and touch controls
- [x] Performance pass and auto quality
- [x] Save and load a whole world
- [x] README, LICENSE and social preview image
- [ ] Public repo and GitHub Pages (Claude asks before pushing)
- [x] Demo GIF and social clip
- [x] Added in Session 4: guided story mode (section 8)

**Gate 4:** every item in the launch checklist (section 2) passes, the stranger test passes, and the live link works on your phone. Commit: "Session 4: polish and launch".

**Session 3 feedback (before Session 4).** The new Lab, Cinematic, Champion and Charts buttons pushed the speed buttons off laptop screens. The top bar now measures itself and steps down until it fits (section 8), checked with screenshots at 1024, 1280, 1366, 1440 and 1920 px, with first-minute and wide late-game numbers. Commit: "Session 3 feedback: top bar fits laptop screens".

**Session 4 notes.** The simulation is unchanged: seeds 1-5 × 30 minutes are bit-identical to the Session 3 commit, and every health check in tools/headless.html in Chrome reads exactly as in Session 3: foraging skill doubled in 20 of 20 worlds; steering clearly rose in 17 of 20; the meat-eater gate passed in 4 of seeds 1-5 and 18 of 20 worlds; a clicked adult lived a median of 73 s (20 worlds × 20 minutes) and 64 s (seeds 1-5 × 60 minutes); at most 14% of babies never ate; the population stayed in its band with no floor arrivals after minute 10; the brain-swap check read 0.83, 0.86 and 1.21 at minutes 1, 10 and 30; at minute 60 average top speed was 73-108 per world with no bugs at 140 or more. New in this session: the intro, tips, Settings tab, reduced motion, sound made in code, the phone layout (a slim one-row top bar and bottom tabs Inspector, Charts, Log and World), fixed or automatic quality (phones top out at medium with no lamp shimmer), saving and loading a whole world, and the guided story (section 8). Checks: the story plays 3:04, 3:27 and 3:33 in seeds 8, 12 and 3 (2:52 in seed 8 before the champion chapter was added for fast worlds) and the world it leaves behind is bit-identical to a fresh world stepped the same number of ticks, on a laptop and with the phone cap; a saved and loaded world continues tick for tick like the original (Node and Chrome, about 2.5 MB per file); with about 350 bugs a tick takes about 0.7 ms and a frame draws in under 2 ms in headless Chrome. Open item: at the phone cap of 150, a hunter species (10 or more alive) forms by minute 20 in only 3 of 20 worlds (laptops: 18 of 20), because fewer births mean fewer gut switches; the story then ends by suggesting Predator drop. Raising the gut-switch chance on phones would fix it but changes the simulation, so it waits for your decision. The demo GIF (docs/demo.gif, 20 s, 900 px, 7.5 MB) and the vertical social clip (docs/social-clip.mp4, 26 s, 1080 × 1920, kept out of git) were recorded from the story mode.

## 12. Copy-paste prompts

Paste each prompt into your **Genesis Lab PowerShell tab**: a tab opened inside the Genesis Lab folder, with Claude running. Start a fresh Claude session for each build session.

**Session 0: setup**

```text
Read PLAN.md in this folder. It is the full build plan for Genesis Lab, an evolution simulator. We are doing Session 0: setup only.

1. Check that git is installed (git --version). If it isn't, tell me exactly how to install it on Windows, then stop.
2. Create the folder layout from PLAN.md section 9. Empty files are fine for now. Add a .gitignore and an MIT LICENSE in the name Christian Fortezzo.
3. Make index.html show a deep navy screen with GENESIS LAB in the center, so I can double-click it to check it works.
4. Set up git in this folder and make the first commit: "Session 0: project setup".

Rules: work only inside this folder, don't push anything to GitHub, and explain what you did in plain English. I don't write code.
```

**Session 1: the simulation lives**

```text
Read PLAN.md in this folder first. We are doing Session 1: "The simulation lives". Build everything in the Session 1 checklist in section 11, following the designs in sections 4, 5, 7 and 9.

Rules:
- Plain JavaScript and Canvas 2D, as classic script files under one global GL namespace, so I can run it by double-clicking index.html. No frameworks, libraries, CDNs, accounts or API keys.
- Write the neural network and the evolution code from scratch.
- Put every tunable number in js/config.js with a comment.
- Plant-eaters only this session. Meat-eating waits for Session 3.
- Build tools/headless.html and use it to tune the balance until foraging skill at least doubles within 10 simulated minutes in 3 different seeds. Show me the before and after numbers.
- Work only in this folder. Ask before deleting anything. Don't push to GitHub.
- I don't write code: explain in plain English what you built, how to open it and what to watch for.

When everything at the Session 1 gate passes, commit with the message "Session 1: core simulation and look", then give me my test checklist from section 10.
```

**Session 2: see inside their minds**

```text
Read PLAN.md, then look at the current code. We are doing Session 2: "See inside their minds". Build everything in the Session 2 checklist in section 11, following sections 6, 7 and 8.

Rules: the same as Session 1 (plain JavaScript, no libraries, every tunable number in config.js, work only in this folder, ask before deleting, no GitHub push, plain-English explanations). The brain viewer is the showpiece: make it look incredible and keep it smooth. Opening panels must not drop the frame rate.

Run the headless test to confirm the simulation still learns. When the Session 2 gate passes, commit "Session 2: inspector, brain viewer, charts" and give me my test checklist from section 10.
```

**Session 3: predators, species and god mode**

```text
Read PLAN.md, then look at the current code. We are doing Session 3: "Predators, species and god mode". Build everything in the Session 3 checklist in section 11, following sections 5 and 6.

Rules: the same as Session 1. Switch on meat-eating, then use the headless test to tune until a meat-eater species appears by itself in at least 3 of 5 seeds within 20 simulated minutes, with prey surviving alongside it. Show me the results for every seed.

When the Session 3 gate passes, commit "Session 3: predators, species, god mode" and give me my test checklist from section 10.
```

**Session 4: polish and launch**

```text
Read PLAN.md, then look at the current code. We are doing Session 4: "Polish and launch". Build everything in the Session 4 checklist in section 11, and follow the launch plan in section 13.

Rules: the same as Session 1. Go through the launch checklist in section 2 and tell me which items pass and which don't. Write the README from the outline in section 13.

Stop and ask me before pushing anything to GitHub. Then walk me through creating the public repo genesis-lab on my GitHub account (fortezzo), pushing it, and turning on GitHub Pages, one step at a time. Commit "Session 4: polish and launch".
```

**Feedback between sessions**

```text
Here's my feedback from testing Genesis Lab. Fix these, run the headless test to make sure nothing broke, then commit:
Off:
Boring:
Ugly:
Confusing:
```

## 13. GitHub launch plan

Launch puts Genesis Lab on a free GitHub Pages link, pinned first on your profile, with a demo GIF that shows evolution happening in 20 seconds.

**Repo**

- Name: genesis-lab, public, MIT license.
- Description: "A living ecosystem where creatures with neural-network brains evolve by themselves, in your browser."
- Topics: artificial-life, evolution-simulator, neural-network, neuroevolution, genetic-algorithm, javascript, canvas, simulation.
- Website field: https://fortezzo.github.io/genesis-lab/

**Turn on GitHub Pages**

1. In the repo, open Settings, then Pages.
2. Under Build and deployment, choose Deploy from a branch, pick the main branch and the / (root) folder, then Save.
3. Wait 1–2 minutes, then open the live link.

**README outline**

1. Title and tagline
2. Looping demo GIF: minute 1 vs minute 10
3. A big "Try it live" link
4. What you're looking at, in three plain sentences
5. Features, with small screenshots
6. How it works: the evolution loop in plain English
7. Under the hood, for engineers: brain layout, view-slice senses, spatial grid, fixed-step loop, energy model, and no libraries
8. Controls and shortcuts
9. Run it yourself: download, then double-click index.html
10. Roadmap
11. License and font credits

**Demo GIF and clip**

- Record the GIF with ScreenToGif (free, for Windows): 15–20 seconds, about 900 px wide, under 10 MB.
- Shot list: intro fade-in → a glide across the terrarium → bugs beelining for sprouts → a click that lights up a brain → a predator hunt → the species streamgraph.
- Social clip: 20–30 seconds, vertical for TikTok and Reels, with the hook on screen in the first second, such as "I built a world where creatures evolve their own brains."

**Profile**

- Pin genesis-lab first on your profile.
- Upload a 1280 × 640 social preview image in the repo settings, so shared links look sharp.
- Mention it at the top of your profile README.

**Where to post**

- X, TikTok, Instagram Reels and LinkedIn. On LinkedIn, frame it as what you built and what you learned.
- Reddit communities such as r/proceduralgeneration and r/artificial, following each one's self-promotion rules.
- Hacker News as a Show HN post, once it's polished.

## 14. Risks

The biggest risk is balance, so the plan builds in a population floor, one config file and a headless test from Session 1.

| Risk | What it looks like | How we handle it |
| --- | --- | --- |
| Bad balance | Everything dies, or the terrarium overflows and nothing improves | Population floor and cap, every number in config.js, and a headless test after every change |
| No visible learning | Minute 10 looks like minute 1 | Plant-eaters first, the foraging-skill chart as proof, and energy costs tuned until skill doubles |
| Predators wipe out prey | Prey die out, then the predators starve | Big targets take longer to kill, biting costs energy, meat decays, and the floor brings in new life |
| Slow on phones | Choppy motion and a hot phone | Lower caps, auto quality, and nothing drawn off screen |
| Looks amateur | Flat colors and clutter | The style guide in section 7 and the screenshot test every session |
| Scope creep | New ideas keep pushing launch back | Strict session checklists; new ideas go to section 17 |
| A change breaks everything | The app stops working after an edit | A git commit at the end of every session, so any earlier version can come back |
| A new chat forgets the plan | The builder doesn't know the details | PLAN.md lives in the folder, and every prompt starts with "Read PLAN.md" |
| Doc and PLAN.md drift apart | You edit the online doc, but the folder still has the old plan | Re-export PLAN.md into the folder after any change to the doc |

## 15. Decisions

Every decision is made, so Session 1 can start as soon as setup is done.

- Name: Genesis Lab.
- World: a round glass lab terrarium seen from directly above (switched from the original ocean dish before Session 2; that version is saved as the git tag `ocean-version`).
- Creatures: little glowing bugs that walk on six legs.
- Colors: glowing cyan-to-blue bugs and green sprouts on navy-tinted soil, warm amber lamp light, and magenta-red predators.
- Sound: on at a quiet volume once someone clicks Begin, with a mute button.
- Folder: OneDrive\Attachments\Genesis-Lab on your computer.
- Tech: plain JavaScript and Canvas 2D, run by double-clicking index.html.
- Repo: public, MIT license, on your fortezzo account.
- Workflow: a fresh Claude session per build session, in your Genesis Lab PowerShell tab.

## 16. Glossary

| Term | Meaning |
| --- | --- |
| Neural network | A tiny artificial brain: numbers go in, get mixed by connection strengths, and decisions come out |
| Weight | One connection strength in a brain; evolution changes these |
| Genome (DNA) | The list of numbers that defines a creature's body and brain |
| Mutation | A small random change to the DNA when a baby is born |
| Generation | How many parents back a creature's family line goes |
| Species | A group whose DNA is close enough to count as one kind |
| Meat-eater | A bug whose diet gene is 0.5 or more: it hunts plant-eaters and eats meat pellets, and has pincers and a spiky shell |
| Gut switch | A rare mutation (about 1 baby in 200) that flips a baby's diet to the opposite of its parent's: how meat-eaters first appear |
| Foraging skill | How many times faster a hungry bug finds food than bugs with random brains in the same spots at the same moment; the main "are they learning?" number |
| Ghost bugs | Invisible bugs that copy real bugs' bodies and places but think with fresh random brains and only pretend to eat; the control group for foraging skill |
| Steering | How often a walking bug that can see food is pointed at it, compared with what luck alone would give |
| Terrarium | A glass container with soil and plants, here a round lab one seen from above |
| Sprout | A tiny seedling: the plant-eaters' food |
| fps | Frames per second, or how smooth it looks; 60 is buttery |
| Tick | One step of the simulation; 60 ticks make a simulated second |
| Seed | A number that sets a world's randomness, so the same seed gives the same start |
| Headless test | Running the simulation with no graphics, as fast as possible, to check the numbers |
| Repo | A project folder on GitHub |
| Commit | A saved checkpoint you can always go back to |
| Push | Uploading your commits to GitHub |
| GitHub Pages | Free GitHub hosting that turns a repo into a live website |
| README | The front page of a repo |

## 17. After launch

These ideas wait until Genesis Lab is live, so they can't delay launch; add new ones here as they come up.

- Two-parent babies that mix DNA
- Brains that grow new neurons and connections (NEAT-style)
- Glow signals other creatures can see, so they can evolve communication
- Creature trading cards: export any creature as a stylish card image with its stats
- Battle mode: drop your saved creature into a friend's world with a share code
- Time-lapse video export
- A side-view version with legged walking physics
- A WebGPU mode for 10,000+ creatures
