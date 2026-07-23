# DoseWise — App Store Connect submission content

Everything to paste into App Store Connect: the **App Privacy** questionnaire
answers and the **store listing** copy. All of it matches what the app actually
does (see `public/privacy.html`) — nothing here over-claims.

---

# Part 1 — App Privacy ("nutrition labels")

App Store Connect → your app → **App Privacy** → **Get Started**.

### Q: "Do you or your third-party partners collect data from this app?"

**Yes.** (You collect an email + scan history for account holders, and send
label photos to a processor.)

> Note on what is NOT collected: anonymous scan history lives only on the device
> (never transmitted), so it is not "collected" per Apple's definition. Barcode
> numbers and product/ingredient names sent to research APIs are product data,
> not personal data, so they aren't a listed data type.

### Data types to select and how to answer each

For every type below: **Used for tracking? → No** (DoseWise does no cross-app/
cross-site tracking, uses no ad or data-broker SDKs, and shows no ATT prompt).
Purpose for every type: **App Functionality** only.

| Data type (Apple category) | Collect? | Linked to identity? | Why it applies |
|---|---|---|---|
| **Email Address** (Contact Info) | Yes | **Linked** | Only for users who create an account, to sign in and sync. |
| **User ID** (Identifiers) | Yes | **Linked** | Supabase assigns an account ID to scope your history to you. |
| **Photos or Videos** (User Content) | Yes | **Not Linked** | A label photo is sent to the AI processor to read the text, then discarded — never stored or tied to your account. |
| **Other Data** (Other) | Yes | **Linked** | For account holders, saved scan history: product name, brand, verdict/score, and timestamp. Describe as "saved supplement scan history." |

Everything else — Location, Contacts, Health & Fitness, Financial Info, Browsing
History, Search History, Purchases, Usage Data, Diagnostics/Crash data,
Advertising Data — **do not select** (DoseWise collects none of it).

### Resulting privacy label (what users will see)

- **Data Used to Track You:** None
- **Data Linked to You:** Email Address · User ID · Other Data (scan history)
- **Data Not Linked to You:** Photos

### Why "Photos" is disclosed but "Not Linked"

The label photo leaves the device (it's sent to Anthropic's API to extract the
text), so it's disclosed as collected. It is never stored and never associated
with your account, so it's **Not Linked**. This is the honest, review-safe
answer — under-disclosing risks rejection; this is accurate.

---

# Part 2 — Store listing copy

App Store Connect → your app → **[version]** → App Information & the version page.
Character limits noted; everything below fits.

### App Name  *(max 30)*
```
DoseWise: Supplement Scanner
```
*(28 chars. Alt: `DoseWise: Supplement Facts` (26), or just `DoseWise`.)*

### Subtitle  *(max 30)*
```
Scan & verify your supplements
```
*(30 chars.)*

### Promotional Text  *(max 170, editable anytime without review)*
```
Know what's really in your supplements. Scan any bottle for a research-backed breakdown of every ingredient, dose, and warning — with links to the science.
```

### Keywords  *(max 100, comma-separated, no spaces)*
```
vitamin,ingredient,label,barcode,nutrition,dosage,research,safety,mineral,herbal,purity,dose,vegan
```
*(98 chars. Don't repeat words already in the name/subtitle — Apple indexes those
automatically. Optional swaps if you want them: `USP`, `NSF`, `FDA`, `recall` —
these reference third-party/government marks; they describe data the app really
uses, but Apple occasionally flags trademarked keywords, so treat as optional.)*

### Description  *(max 4000)*
```
What's actually in that supplement? DoseWise reads the label for you and gives you a clear, research-backed verdict in seconds — so you can tell whether a product lives up to its claims before you take it.

HOW IT WORKS
• Scan the barcode, snap a photo of the label, or type in the UPC.
• DoseWise identifies the product and pulls the facts on every ingredient.
• You get a color-coded verdict plus the detail behind it.

WHAT YOU GET
• Ingredient-by-ingredient breakdown — amounts, %DV, and whether each dose is below, at, or above what research supports.
• Plain-language notes on what each ingredient is and what the evidence says.
• Warnings — FDA recalls, proprietary blends, and doses that push past safe upper limits.
• Third-party certification status (like USP and NSF) when it can be verified.
• Links to the actual studies, so you can read the source yourself.

BUILT ON REAL SOURCES
DoseWise draws on the NIH Dietary Supplement Label Database, the National Library of Medicine's PubMed, and openFDA — and cites the research behind each finding.

HONEST BY DESIGN
When the evidence is thin, DoseWise tells you so and lowers its confidence instead of guessing. It won't invent sources, studies, or certifications. If it isn't sure, it says it isn't sure.

PRIVATE
Use it without an account — anonymous scans stay on your device. No ads, no third-party trackers, no selling your data. Create an optional account only if you want your history synced across devices.

DoseWise provides informational summaries of publicly available research and regulatory data. It is not medical advice and does not diagnose, treat, or prevent any condition. Always talk to a doctor or pharmacist before starting, stopping, or combining supplements.
```

### What's New in This Version  *(v1.0.0)*
```
The first release of DoseWise. Scan a supplement by barcode, label photo, or UPC and get a research-backed breakdown of every ingredient — with FDA warnings, certification status, and links to the science. Thanks for trying it out; send feedback to bmac96.dev@gmail.com.
```

### URLs
| Field | Value |
|---|---|
| **Support URL** (required) | `https://dose-wise-beta.vercel.app/support.html` |
| **Privacy Policy URL** (required) | `https://dose-wise-beta.vercel.app/privacy.html` |
| **Marketing URL** (optional) | leave blank, or reuse the support URL |

### Other App Information fields
- **Category:** Primary **Health & Fitness**; Secondary **Medical** (or
  **Reference**). Health & Fitness is the better primary — Medical invites
  stricter review.
- **Age Rating:** answer the questionnaire honestly — expect **17+** because of
  "Medical/Treatment Information" (informational health content). No mature
  content otherwise.
- **Price:** Free.

---

# Part 3 — App Review notes (paste into "Notes" for the reviewer)

```
DoseWise is an informational supplement-label reference app. It does not require an account — you can scan and get a full report anonymously. An optional email/password account only syncs scan history.

How to test:
• On the Scan tab, use "Enter UPC" and type 074312021008 for a sample report, or photograph any supplement label with "Photo the label."
• Account deletion: Settings → Delete account (permanently removes the account and synced history).

The app shows informational summaries of public research (NIH DSLD, PubMed, openFDA) and is not medical advice; a disclaimer is shown on first launch and in Settings.
```

---

## Reminders when filling this in
- The **privacy answers above must match** what `public/privacy.html` says — they
  do; if you change the policy, revisit the labels.
- Sign-in with Apple is **not** required (email/password only, no Google/social
  login). If you add social login later, Apple will require Sign in with Apple too.
- Screenshots are still needed (6.7" and 6.5" iPhone). Those come from a build/
  simulator — separate step.
