import type {
  BehaviorFixture,
  CommandFamily,
  ContractCommand,
  ContractStep,
  PrototypeDeviation,
  SyntheticUser,
  WorkdayState,
} from "./types";

export const COMMAND_ALIASES = {
  start: ["/start", "/rozpocznij", "/hi"],
  stop: ["/stop", "/koniec", "/zakoncz", "/bb", "/end", "/adios"],
  "break-start": ["/break", "/przerwa", "/zw", "/brb"],
  "break-end": ["/endbreak", "/koniecprzerwy", "/jj"],
  office: ["/office", "/biuro"],
  status: ["/status"],
  who: ["/who", "/kto"],
} as const satisfies Record<CommandFamily, readonly `/${string}`[]>;

export const OFFICE_FLAGS = ["-b", "-biuro", "-o", "-office"] as const;

export const SYNTHETIC_USERS = [
  { id: "user-alfa", displayName: "Ala Przykład", team: "Atlas", role: "FE" },
  { id: "user-beta", displayName: "Bartek Testowy", team: "Atlas", role: "BE" },
  { id: "user-gamma", displayName: "Celina Fikcyjna", team: "Bursztyn", role: "QA" },
  { id: "user-delta", displayName: "Damian Syntetyczny", team: "Bursztyn", role: "DO" },
] as const satisfies readonly SyntheticUser[];

const DAY = "2031-04-15";

function at(time: string): string {
  return `${DAY}T${time}:00.000+02:00`;
}

function command(family: CommandFamily, alias: `/${string}`, ...arguments_: string[]): ContractCommand {
  return { family, alias, arguments: arguments_ };
}

function idle(userId: string): WorkdayState {
  return {
    userId,
    isWorking: false,
    isOnBreak: false,
    isOffice: false,
    breaks: [],
  };
}

function working(
  userId: string,
  startedAt: string,
  options: {
    office?: boolean;
    onBreak?: boolean;
    breaks?: WorkdayState["breaks"];
  } = {},
): WorkdayState {
  return {
    userId,
    isWorking: true,
    isOnBreak: options.onBreak ?? false,
    isOffice: options.office ?? false,
    startedAt,
    breaks: options.breaks ?? [],
  };
}

function finished(
  userId: string,
  startedAt: string,
  endedAt: string,
  breaks: WorkdayState["breaks"] = [],
): WorkdayState {
  return {
    userId,
    isWorking: false,
    isOnBreak: false,
    isOffice: false,
    startedAt,
    endedAt,
    breaks,
  };
}

function textStep(
  id: string,
  actorId: string,
  now: string,
  command_: ContractCommand,
  states: readonly WorkdayState[],
  options: Pick<ContractStep, "activeAnnouncement" | "note"> & {
    outcome?: "accepted" | "rejected";
    workedMinutes?: Readonly<Record<string, number>>;
  } = {},
): ContractStep {
  return {
    id,
    actorId,
    now,
    command: command_,
    activeAnnouncement: options.activeAnnouncement,
    note: options.note,
    expected: {
      outcome: options.outcome ?? "accepted",
      responseSchema: "text",
      states,
      workedMinutes: options.workedMinutes,
    },
  };
}

function aliasFixture(family: CommandFamily, alias: `/${string}`): BehaviorFixture {
  const now = at("10:00");
  const startedAt = at("09:00");
  const base = {
    id: `alias-${family}-${alias.slice(1)}`,
    description: `Rozpoznaje alias ${alias} jako rodzinę ${family}.`,
    users: SYNTHETIC_USERS,
  } as const;

  switch (family) {
    case "start":
      return {
        ...base,
        initialStates: [idle("user-alfa")],
        steps: [textStep("execute", "user-alfa", now, command(family, alias), [working("user-alfa", now)])],
      };
    case "stop":
      return {
        ...base,
        initialStates: [working("user-alfa", startedAt)],
        steps: [
          textStep("execute", "user-alfa", now, command(family, alias), [finished("user-alfa", startedAt, now)], {
            workedMinutes: { "user-alfa": 60 },
          }),
        ],
      };
    case "break-start":
      return {
        ...base,
        initialStates: [working("user-alfa", startedAt)],
        steps: [
          textStep("execute", "user-alfa", now, command(family, alias), [
            working("user-alfa", startedAt, { onBreak: true, breaks: [{ startedAt: now }] }),
          ]),
        ],
      };
    case "break-end":
      return {
        ...base,
        initialStates: [working("user-alfa", startedAt, { onBreak: true, breaks: [{ startedAt: at("09:45") }] })],
        steps: [
          textStep("execute", "user-alfa", now, command(family, alias), [
            working("user-alfa", startedAt, {
              breaks: [{ startedAt: at("09:45"), endedAt: now }],
            }),
          ]),
        ],
      };
    case "office":
      return {
        ...base,
        initialStates: [working("user-alfa", startedAt)],
        steps: [
          textStep("execute", "user-alfa", now, command(family, alias), [
            working("user-alfa", startedAt, { office: true }),
          ]),
        ],
      };
    case "status":
      return {
        ...base,
        initialStates: [working("user-alfa", startedAt)],
        steps: [
          textStep("execute", "user-alfa", now, command(family, alias), [working("user-alfa", startedAt)], {
            workedMinutes: { "user-alfa": 60 },
          }),
        ],
      };
    case "who": {
      const state = working("user-alfa", startedAt);
      return {
        ...base,
        initialStates: [state],
        steps: [
          {
            id: "execute",
            actorId: "user-alfa",
            now,
            command: command(family, alias),
            expected: {
              outcome: "accepted",
              responseSchema: "legacy-card",
              states: [state],
              visibleUserIds: ["user-alfa"],
            },
          },
        ],
      };
    }
  }
}

const aliasFixtures: readonly BehaviorFixture[] = (
  Object.entries(COMMAND_ALIASES) as [CommandFamily, readonly `/${string}`[]][]
).flatMap(([family, aliases]) => aliases.map((alias) => aliasFixture(family, alias)));

const officeFlagFixtures: readonly BehaviorFixture[] = OFFICE_FLAGS.map((flag) => {
  const state = working("user-alfa", at("09:00"), { office: true });

  return {
    id: `start-office-${flag.slice(1)}`,
    description: `Start z flagą ${flag} ustawia pracę biurową.`,
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [textStep("start", "user-alfa", at("09:00"), command("start", "/start", flag, "09:00"), [state])],
  };
});

export const BEHAVIOR_FIXTURES: readonly BehaviorFixture[] = [
  ...aliasFixtures,
  ...officeFlagFixtures,
  {
    id: "start-remote-with-announcement",
    description: "Start zdalny korzysta z kontrolowanego zegara i opcjonalnego seam ogłoszenia.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [
      textStep("start", "user-alfa", at("08:45"), command("start", "/start"), [working("user-alfa", at("08:45"))], {
        activeAnnouncement: "Syntetyczne ogłoszenie na dziś",
      }),
    ],
  },
  {
    id: "start-explicit-time-and-repeat",
    description: "Jawny czas startu jest osadzany w dniu zegara, a ponowny start jest odrzucany bez zmiany stanu.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [
      textStep("explicit-start", "user-alfa", at("10:00"), command("start", "/rozpocznij", "07:30"), [
        working("user-alfa", at("07:30")),
      ]),
      textStep("repeat-start", "user-alfa", at("10:05"), command("start", "/hi"), [working("user-alfa", at("07:30"))], {
        outcome: "rejected",
      }),
    ],
  },
  {
    id: "case-insensitive-routing",
    description: "Nazwy komend są rozpoznawane bez względu na wielkość liter.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [
      textStep("mixed-case-start", "user-alfa", at("09:00"), command("start", "/StArT"), [
        working("user-alfa", at("09:00")),
      ]),
      {
        id: "mixed-case-who",
        actorId: "user-alfa",
        now: at("09:01"),
        command: command("who", "/KtO"),
        expected: {
          outcome: "accepted",
          responseSchema: "legacy-card",
          states: [working("user-alfa", at("09:00"))],
          visibleUserIds: ["user-alfa"],
        },
      },
    ],
  },
  {
    id: "resume-clears-finished-state",
    description: "Start po zakończeniu dnia nie przenosi dawnego końca ani przerw.",
    users: SYNTHETIC_USERS,
    initialStates: [
      finished("user-alfa", at("08:00"), at("09:00"), [{ startedAt: at("08:30"), endedAt: at("08:45") }]),
    ],
    steps: [
      textStep("resume", "user-alfa", at("10:00"), command("start", "/start"), [working("user-alfa", at("10:00"))]),
    ],
  },
  {
    id: "full-workday-with-break",
    description: "Pełny dzień odejmuje wyłącznie zakończoną przerwę z wyniku minutowego.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [
      textStep("start", "user-alfa", at("09:00"), command("start", "/start", "09:00"), [
        working("user-alfa", at("09:00")),
      ]),
      textStep("break-start", "user-alfa", at("12:00"), command("break-start", "/break"), [
        working("user-alfa", at("09:00"), {
          onBreak: true,
          breaks: [{ startedAt: at("12:00") }],
        }),
      ]),
      textStep("break-end", "user-alfa", at("12:30"), command("break-end", "/endbreak"), [
        working("user-alfa", at("09:00"), {
          breaks: [{ startedAt: at("12:00"), endedAt: at("12:30") }],
        }),
      ]),
      textStep(
        "stop",
        "user-alfa",
        at("17:00"),
        command("stop", "/stop", "17:00"),
        [finished("user-alfa", at("09:00"), at("17:00"), [{ startedAt: at("12:00"), endedAt: at("12:30") }])],
        { workedMinutes: { "user-alfa": 450 } },
      ),
    ],
  },
  {
    id: "stop-closes-open-break",
    description: "Zatrzymanie podczas przerwy zamyka ją czasem stop i odejmuje od wyniku.",
    users: SYNTHETIC_USERS,
    initialStates: [working("user-alfa", at("09:00"), { onBreak: true, breaks: [{ startedAt: at("16:00") }] })],
    steps: [
      textStep(
        "stop",
        "user-alfa",
        at("17:00"),
        command("stop", "/koniec"),
        [finished("user-alfa", at("09:00"), at("17:00"), [{ startedAt: at("16:00"), endedAt: at("17:00") }])],
        { workedMinutes: { "user-alfa": 420 } },
      ),
    ],
  },
  {
    id: "invalid-state-transitions",
    description: "Nieprawidłowe przejścia nie zmieniają stanu dnia pracy.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [
      textStep("stop-before-start", "user-alfa", at("09:00"), command("stop", "/stop"), [idle("user-alfa")], {
        outcome: "rejected",
      }),
      textStep(
        "break-before-start",
        "user-alfa",
        at("09:01"),
        command("break-start", "/przerwa"),
        [idle("user-alfa")],
        { outcome: "rejected" },
      ),
      textStep("end-break-before-start", "user-alfa", at("09:02"), command("break-end", "/jj"), [idle("user-alfa")], {
        outcome: "rejected",
      }),
      textStep("office-before-start", "user-alfa", at("09:03"), command("office", "/office"), [idle("user-alfa")], {
        outcome: "rejected",
      }),
    ],
  },
  {
    id: "invalid-break-transitions",
    description: "Nie można rozpocząć drugiej przerwy ani zakończyć nieotwartej.",
    users: SYNTHETIC_USERS,
    initialStates: [working("user-alfa", at("09:00"))],
    steps: [
      textStep(
        "end-missing-break",
        "user-alfa",
        at("10:00"),
        command("break-end", "/koniecprzerwy"),
        [working("user-alfa", at("09:00"))],
        { outcome: "rejected" },
      ),
      textStep("start-break", "user-alfa", at("10:05"), command("break-start", "/zw"), [
        working("user-alfa", at("09:00"), { onBreak: true, breaks: [{ startedAt: at("10:05") }] }),
      ]),
      textStep(
        "repeat-break",
        "user-alfa",
        at("10:06"),
        command("break-start", "/brb"),
        [working("user-alfa", at("09:00"), { onBreak: true, breaks: [{ startedAt: at("10:05") }] })],
        { outcome: "rejected" },
      ),
    ],
  },
  {
    id: "office-and-status",
    description: "Pracująca osoba może przełączyć lokalizację na biuro i sprawdzić status.",
    users: SYNTHETIC_USERS,
    initialStates: [working("user-alfa", at("09:00"))],
    steps: [
      textStep("office", "user-alfa", at("10:00"), command("office", "/biuro"), [
        working("user-alfa", at("09:00"), { office: true }),
      ]),
      textStep(
        "status",
        "user-alfa",
        at("10:30"),
        command("status", "/status"),
        [working("user-alfa", at("09:00"), { office: true })],
        { workedMinutes: { "user-alfa": 90 } },
      ),
    ],
  },
  {
    id: "status-open-break-keeps-elapsed-minutes",
    description: "Status podczas otwartej przerwy nie odejmuje jej czasu, dopóki przerwa nie zostanie zakończona.",
    users: SYNTHETIC_USERS,
    initialStates: [working("user-alfa", at("09:00"), { onBreak: true, breaks: [{ startedAt: at("10:00") }] })],
    steps: [
      textStep(
        "status-on-break",
        "user-alfa",
        at("11:00"),
        command("status", "/status"),
        [working("user-alfa", at("09:00"), { onBreak: true, breaks: [{ startedAt: at("10:00") }] })],
        { workedMinutes: { "user-alfa": 120 } },
      ),
    ],
  },
  {
    id: "legacy-future-and-negative-time",
    description: "Poprawny HH:MM może wskazywać przyszłość lub dać ujemny okres; kontrakt go nie odrzuca.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa")],
    steps: [
      textStep("future-start", "user-alfa", at("09:00"), command("start", "/start", "18:00"), [
        working("user-alfa", at("18:00")),
      ]),
      textStep(
        "earlier-stop",
        "user-alfa",
        at("09:05"),
        command("stop", "/end", "08:00"),
        [finished("user-alfa", at("18:00"), at("08:00"))],
        { workedMinutes: { "user-alfa": -600 } },
      ),
    ],
  },
  {
    id: "legacy-reversed-break",
    description: "Odwrócona przerwa jest dozwolona i jej ujemna długość zwiększa wynik dnia.",
    users: SYNTHETIC_USERS,
    initialStates: [working("user-alfa", at("09:00"))],
    steps: [
      textStep("break-start", "user-alfa", at("12:00"), command("break-start", "/break", "13:00"), [
        working("user-alfa", at("09:00"), { onBreak: true, breaks: [{ startedAt: at("13:00") }] }),
      ]),
      textStep("break-end", "user-alfa", at("12:01"), command("break-end", "/endbreak", "12:00"), [
        working("user-alfa", at("09:00"), {
          breaks: [{ startedAt: at("13:00"), endedAt: at("12:00") }],
        }),
      ]),
      textStep(
        "stop",
        "user-alfa",
        at("17:00"),
        command("stop", "/stop", "17:00"),
        [finished("user-alfa", at("09:00"), at("17:00"), [{ startedAt: at("13:00"), endedAt: at("12:00") }])],
        { workedMinutes: { "user-alfa": 540 } },
      ),
    ],
  },
  {
    id: "time-token-policy",
    description: "Token niepasujący do HH:MM jest ignorowany, ale pasujący token spoza zakresu jest błędem.",
    users: SYNTHETIC_USERS,
    initialStates: [idle("user-alfa"), idle("user-beta")],
    steps: [
      textStep("ignored-token", "user-alfa", at("09:15"), command("start", "/start", "rano"), [
        working("user-alfa", at("09:15")),
        idle("user-beta"),
      ]),
      textStep(
        "out-of-range",
        "user-beta",
        at("09:16"),
        command("start", "/start", "24:00"),
        [working("user-alfa", at("09:15")), idle("user-beta")],
        { outcome: "rejected" },
      ),
    ],
  },
  {
    id: "who-company-wide-and-filters",
    description: "/who pokazuje wyłącznie obecnie pracujących, w tym osoby na przerwie, i obsługuje filtry.",
    users: SYNTHETIC_USERS,
    initialStates: [
      working("user-alfa", at("09:00"), { office: true }),
      working("user-beta", at("09:10"), { onBreak: true, breaks: [{ startedAt: at("11:00") }] }),
      working("user-gamma", at("08:30")),
      finished("user-delta", at("08:00"), at("12:00")),
    ],
    steps: [
      {
        id: "all-active",
        actorId: "user-alfa",
        now: at("12:30"),
        command: command("who", "/who"),
        expected: {
          outcome: "accepted",
          responseSchema: "legacy-card",
          states: [
            working("user-alfa", at("09:00"), { office: true }),
            working("user-beta", at("09:10"), { onBreak: true, breaks: [{ startedAt: at("11:00") }] }),
            working("user-gamma", at("08:30")),
            finished("user-delta", at("08:00"), at("12:00")),
          ],
          visibleUserIds: ["user-alfa", "user-beta", "user-gamma"],
        },
      },
      {
        id: "office-filter",
        actorId: "user-alfa",
        now: at("12:31"),
        command: command("who", "/kto", "-b"),
        expected: {
          outcome: "accepted",
          responseSchema: "legacy-card",
          states: [
            working("user-alfa", at("09:00"), { office: true }),
            working("user-beta", at("09:10"), { onBreak: true, breaks: [{ startedAt: at("11:00") }] }),
            working("user-gamma", at("08:30")),
            finished("user-delta", at("08:00"), at("12:00")),
          ],
          visibleUserIds: ["user-alfa"],
        },
      },
      {
        id: "team-filter",
        actorId: "user-alfa",
        now: at("12:32"),
        command: command("who", "/who", "Atlas"),
        expected: {
          outcome: "accepted",
          responseSchema: "legacy-card",
          states: [
            working("user-alfa", at("09:00"), { office: true }),
            working("user-beta", at("09:10"), { onBreak: true, breaks: [{ startedAt: at("11:00") }] }),
            working("user-gamma", at("08:30")),
            finished("user-delta", at("08:00"), at("12:00")),
          ],
          visibleUserIds: ["user-alfa", "user-beta"],
        },
      },
      {
        id: "role-filter",
        actorId: "user-alfa",
        now: at("12:33"),
        command: command("who", "/who", "QA"),
        expected: {
          outcome: "accepted",
          responseSchema: "legacy-card",
          states: [
            working("user-alfa", at("09:00"), { office: true }),
            working("user-beta", at("09:10"), { onBreak: true, breaks: [{ startedAt: at("11:00") }] }),
            working("user-gamma", at("08:30")),
            finished("user-delta", at("08:00"), at("12:00")),
          ],
          visibleUserIds: ["user-gamma"],
        },
      },
    ],
  },
];

export const RESPONSE_EXAMPLES = {
  text: { text: "Syntetyczna odpowiedź kontraktowa" },
  "legacy-card": {
    cards: [
      {
        header: { title: "Pracujące osoby" },
        sections: [
          {
            header: "Atlas",
            widgets: [{ keyValue: { topLabel: "Ala Przykład", content: "Pracuje" } }],
          },
        ],
      },
    ],
  },
} as const;

export const PROTOTYPE_DEVIATIONS: readonly PrototypeDeviation[] = [
  {
    id: "who-current-workers-only",
    classification: "prd-override",
    prototypeBehavior: "/who uwzględnia osoby, które zakończyły pracę.",
    contractBehavior: "/who zwraca wyłącznie obecnie pracujące osoby; przerwa nadal oznacza aktywny dzień.",
    rationale: "US-01 i FR-009 są nadrzędne wobec historycznego bundla.",
  },
  {
    id: "announcement-input-only",
    classification: "extension-seam",
    prototypeBehavior: "/start nie ma działającego źródła aktywnego ogłoszenia HR.",
    contractBehavior: "Adapter może otrzymać activeAnnouncement wraz z wywołaniem /start.",
    rationale: "F-01 definiuje punkt podłączenia dla S-04 bez pobierania danych.",
  },
  {
    id: "schema-only-responses",
    classification: "prototype-defect",
    prototypeBehavior: "Bundle zawiera konkretne historyczne teksty i formatowanie odpowiedzi.",
    contractBehavior: "Asercje sprawdzają tylko schemat { text } albo legacy card.",
    rationale: "Treść, interpunkcja i lokalny format godzin nie są zamrażane przez F-01.",
  },
  {
    id: "clean-resume-state",
    classification: "prototype-defect",
    prototypeBehavior: "Wznowienie pracy może zachować endTime i dawne przerwy.",
    contractBehavior: "Nowy start po zakończeniu rozpoczyna czysty stan bieżącego dnia.",
    rationale: "Plan jawnie wyklucza pozostałości stanu po wznowieniu pracy.",
  },
  {
    id: "legacy-time-ordering",
    classification: "accepted-legacy",
    prototypeBehavior: "Czas HH:MM jest osadzany w bieżącym dniu bez kontroli kolejności.",
    contractBehavior: "Przyszłe, odwrócone i ujemne okresy pozostają dozwolone.",
    rationale: "To świadomie zachowana semantyka czasu wskazana w planie.",
  },
];
