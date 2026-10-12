import { ArrowRight, FileText, Scale, Gavel, HandCoins } from "lucide-react";
export function HowItWorks() {
  return (
    <section className="page-section how-page">
      <div className="page-heading">
        <p className="eyebrow">The rules of the court</p>
        <h1>
          No admins. No votes.
          <br />A jury of <em>agents.</em>
        </h1>
        <p>
          Prediction markets backed by VERDICT stakes and the IMD oracle. Anyone
          can file a case. Anyone can take a position.
        </p>
      </div>
      <div className="how-grid">
        {[
          [
            FileText,
            "01",
            "File a case",
            "Create a precise YES / NO question with a fixed observation time and public evidence. Deposit a 10,000 VERDICT bond and the current jury fee, initially 0.5 IMD.",
          ],
          [
            Scale,
            "02",
            "Take a position",
            "Bet at least 100 VERDICT on YES or NO before the close. Stakes are locked until a final result. Pool shares reflect positions, not objective probabilities.",
          ],
          [
            Gavel,
            "03",
            "Summon the jury",
            "After the resolution time, anyone can request a verdict. This site requests five agents and requires four to agree. The oracle signs the answer; the contract verifies it.",
          ],
          [
            HandCoins,
            "04",
            "Claim the result",
            "Winners split the losing pool after its 2% settlement charge: 1% to the creator and 1% to the burn sink. The creator gets the bond back. Each wallet claims once.",
          ],
        ].map(([Icon, number, title, body]) => {
          const Glyph = Icon as typeof FileText;
          return (
            <article key={String(number)} className="panel how-card">
              <div className="how-card-top">
                <Glyph size={27} strokeWidth={1.3} aria-hidden="true" />
                <span>{String(number)}</span>
              </div>
              <h2>{String(title)}</h2>
              <p>{String(body)}</p>
            </article>
          );
        })}
      </div>
      <div className="prose">
        <h2>When there is no verdict</h2>
        <p>
          An oracle failure or a timeout makes a case eligible for VOID. In a
          VOID or one-sided market, both YES and NO stakes are fully refunded.
          The bond returns in every final state. Jury fees already spent on a
          two-sided request are not refunded.
        </p>
        <p>
          If nobody requests resolution, anyone may void the case seven days
          after its resolution time. A successful two-sided request starts a new
          seven-day answer window, so a late request can bring the total wait
          close to 14 days. Passing a deadline does not itself move funds:
          someone must call the timeout function, and participants must claim.
        </p>
        <h2>What you are trusting</h2>
        <p>
          The jury evaluates evidence; code cannot independently determine the
          truth of a real-world event. Markets trust their stored Intake, oracle
          signer, and question. A failure message is supplied by the Intake.
          Inspect those terms before betting.
        </p>
        <p>
          The owner cannot withdraw stakes or resolve markets. It can configure
          dependencies for future markets after a 48-hour notice period and an
          activation transaction. Existing markets retain their original
          configuration, including an old signer after a rotation.
        </p>
        <h2>The question is the contract</h2>
        <p>
          A market’s title is only a label. The original oracle question,
          definitions, and observation time are shown on the case page and again
          before betting. Read them. A relative 24-hour evidence window runs
          when the oracle processes the request; it does not turn the resolution
          time into a fixed observation time.
        </p>
        <h2>Fees and payout math</h2>
        <p>
          In a two-sided YES / NO result, each winner receives their winning
          stake plus their share of the losing pool, after fees. Each 1% fee is
          rounded down in token minor units; the final winning claimant receives
          any rounding remainder. A bettor may hold both sides. A losing wallet
          can mark a zero-value claim once.
        </p>
        <p>
          The pool’s trading fee is separate from market settlement. ETH is
          needed for transaction fees. USD prices are not supplied by this
          deployment.
        </p>
        <div className="button-row">
          <a className="button primary" href="#markets">
            Explore the docket <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className="button outline" href="#protocol">
            Inspect the protocol
          </a>
        </div>
      </div>
    </section>
  );
}
